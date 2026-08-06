import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { truncateForLog } from "@/lib/observability/safe-log";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildKnowledgeProcessingPrompt } from "@/lib/ai/prompts/knowledge-processing";
import { parseKnowledgeProcessing } from "@/lib/ai/validation/knowledge-processing";
import { normalizeEntityKey } from "./processing/taxonomy";
import { computeDomainCompleteness } from "./processing/completeness";
import { listItems, type KnowledgeItem } from "./service";

/**
 * محرّك معالجة المعرفة — استخراج ذكاء الأعمال المهيكل.
 *
 * ## المكان في المنظومة
 *
 * بعد ما `service.ts` بيصنّف المصادر لعناصر معرفة حرة، و`enrichment`
 * بيربطها ويكشف تعارضاتها، **ده بياخد المعرفة المتراكمة ويستخرج منها
 * كائنات مهيكلة**: كيانات لها أنواع ومفاتيح، قواعد عمل بشرط ونتيجة،
 * سير عمل بخطوات مرتّبة، متطلبات وقرارات ومخاطر مصنّفة.
 *
 * ## قرارات تشغيلية
 *
 * 1. **مجال واحد لكل استدعاء.** نفس مبدأ باقي المحرّكات: كل استدعاء
 *    يفضل جوّه حد وقت التنفيذ الآمن، والواجهة/العامل بيدفع اللي بعده.
 *    المجال بيتحدّد من `declared_domain` للمصدر، أو «عام» لو غاب.
 *
 * 2. **الكيان يندمج لا يتضاعف.** الكتابة بتفحص المفتاح المطبَّع الأول:
 *    كيان موجود بياخد `mention_count++`، والجديد بس بيتزرع. ده اللي
 *    بيخلّي «قسم المبيعات» من عشر مستندات كيانًا واحدًا لا عشرة.
 *
 * 3. **الوسم يمنع إعادة المعالجة.** العنصر اللي اتعالج بياخد وسم
 *    `PROCESSED_TAG` — **يتخطّى البوابة عن قصد**: ده ختم تشغيل لا
 *    تغيير معرفة، وتسجيله كإصدار كان هيملأ التاريخ بضجيج.
 */

/** الوسم اللي بيتحط على العنصر بعد ما يتعالج — يمنع إعادة استخراجه. */
export const PROCESSED_TAG = "processed";

/** أقصى عدد عناصر بيتبعت للنموذج في استدعاء واحد. */
const MAX_ITEMS_PER_CALL = 60;

/** المجال الافتراضي للعناصر اللي مصدرها بلا مجال مُعلَن. */
const DEFAULT_DOMAIN = "عام";

export interface ProcessingOutcome {
  status: "idle" | "processed" | "failed";
  domain?: string;
  counts?: {
    entities: number;
    relations: number;
    rules: number;
    workflows: number;
    requirements: number;
    decisions: number;
    risks: number;
  };
  completeness?: number;
  remainingDomains?: number;
  message?: string;
}

/**
 * يعالج مجالًا واحدًا من مجالات المعرفة غير المعالَجة.
 * بيرجّع `idle` لما مفيش مجال محتاج معالجة.
 */
export async function processNextDomain(
  projectId: string,
  actorId?: string | null
): Promise<ProcessingOutcome> {
  const supabase = createServiceClient();

  const allItems = await listItems(supabase, projectId, 2000);
  const unprocessed = allItems.filter((i) => !i.tags?.includes(PROCESSED_TAG));
  if (unprocessed.length === 0) return { status: "idle" };

  const domainOf = await buildDomainResolver(supabase, unprocessed);
  const byDomain = groupBy(unprocessed, (i) => domainOf(i.source_id));

  // نبدأ بالمجال الأكبر: أعلى كثافة معرفة، فأعلى عائد لكل استدعاء.
  const [domain, domainItems] = [...byDomain.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )[0];

  const working = domainItems.slice(0, MAX_ITEMS_PER_CALL);

  try {
    const projectName = await getProjectName(supabase, projectId);
    const knowledgeText = working
      .map((i, n) => `[${n + 1}] (${i.category}) ${i.title}\n${i.content}`)
      .join("\n\n");

    const prompt = buildKnowledgeProcessingPrompt({
      projectName,
      declaredDomain: domain === DEFAULT_DOMAIN ? null : domain,
      knowledgeText,
    });

    const response = await executeAIWithRateLimitWait(AITaskType.KNOWLEDGE_PROCESSING, prompt, {
      actorId: actorId ?? undefined,
      projectId,
    });

    if (!response.success) {
      return {
        status: "failed",
        domain,
        message: response.error?.message ?? "فشل استخراج ذكاء الأعمال.",
      };
    }

    // النص المصدر لحارس الاقتباس هو نفس المعرفة اللي بعتناها.
    const result = parseKnowledgeProcessing(response.output, knowledgeText);
    if (!result.ok) {
      console.error(
        `[KnowledgeHub] تعذّر فهم نتيجة المعالجة لمجال ${domain}: ${truncateForLog(result.reason)}`
      );
      // المجال بيتعلّم كمعالَج برضه: الوقوف كان هيخلّيه يتحاول عليه للأبد
      // ويمنع باقي المجالات من الدور.
      await markProcessed(supabase, working);
      return {
        status: "processed",
        domain,
        counts: emptyCounts(),
        completeness: 0,
        remainingDomains: byDomain.size - 1,
      };
    }

    if (result.droppedForMissingQuote > 0) {
      console.warn(
        `[KnowledgeHub] أُسقط ${result.droppedForMissingQuote} كائن بلا اقتباس موجود في مجال ${domain}.`
      );
    }

    const sourceId = working[0]?.source_id ?? null;

    // --- الكتابة ---
    const entityIdByKey = await writeEntities(supabase, projectId, sourceId, result.data.entities);
    const relations = await writeRelations(supabase, projectId, result.data.relations, entityIdByKey);
    const rules = await writeRules(supabase, projectId, sourceId, result.data.rules);
    const workflows = await writeWorkflows(supabase, projectId, sourceId, result.data.workflows);
    const requirements = await writeRequirements(supabase, projectId, sourceId, result.data.requirements);
    const decisions = await writeDecisions(supabase, projectId, sourceId, result.data.decisions);
    const risks = await writeRisks(supabase, projectId, sourceId, result.data.risks);

    // --- لقطة الاكتمال ---
    const snapshot = computeDomainCompleteness(domain, result.data);
    await supabase.from("knowledge_domain_completeness").insert({
      project_id: projectId,
      domain,
      completeness: snapshot.score,
      entity_count: snapshot.counts.entities,
      rule_count: snapshot.counts.rules,
      requirement_count: snapshot.counts.requirements,
      gap_count: snapshot.gaps.length,
      missing_aspects: snapshot.gaps,
    });

    await markProcessed(supabase, working);

    const counts = {
      entities: entityIdByKey.size,
      relations,
      rules,
      workflows,
      requirements,
      decisions,
      risks,
    };

    return {
      status: "processed",
      domain,
      counts,
      completeness: snapshot.score,
      remainingDomains: byDomain.size - 1,
    };
  } catch (err) {
    console.error(`[KnowledgeHub] فشل غير متوقع أثناء معالجة مجال ${domain}:`, err);
    return {
      status: "failed",
      domain,
      message: err instanceof Error ? err.message : "خطأ غير متوقع أثناء المعالجة.",
    };
  }
}

// ============================================================
// الكتابة — كيانات
// ============================================================

/**
 * يكتب الكيانات مع الدمج على المفتاح المطبَّع.
 *
 * بيقرأ الكيانات النشطة الموجودة مرة واحدة، وبعدين لكل كيان مستخرَج:
 * موجود؟ `mention_count++`. جديد؟ إدراج. الإدراج جماعي — رحلة واحدة
 * للجدد كلهم بدل رحلة لكل واحد.
 *
 * بيرجّع خريطة `normalized_key → id` عشان العلاقات تحلّ أطرافها.
 */
async function writeEntities(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string | null,
  entities: Array<{ entityType: string; name: string; normalizedKey: string; description: string; confidence: number; quote: string }>
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  if (entities.length === 0) return idByKey;

  const { data: existing } = await supabase
    .from("knowledge_entities")
    .select("id, entity_type, normalized_key, mention_count")
    .eq("project_id", projectId)
    .eq("status", "active");

  const existingByKey = new Map<string, { id: string; mentionCount: number }>();
  for (const e of (existing ?? []) as Array<{ id: string; entity_type: string; normalized_key: string; mention_count: number }>) {
    existingByKey.set(`${e.entity_type}::${e.normalized_key}`, { id: e.id, mentionCount: e.mention_count });
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const toBump: Array<{ id: string; next: number }> = [];
  const seenNew = new Set<string>();

  for (const ent of entities) {
    const compositeKey = `${ent.entityType}::${ent.normalizedKey}`;
    const match = existingByKey.get(compositeKey);
    if (match) {
      idByKey.set(ent.normalizedKey, match.id);
      // كيان موجود — نزوّد عدّاد الإشارات (مرة واحدة لكل كيان في الدفعة).
      if (!seenNew.has(compositeKey)) {
        seenNew.add(compositeKey);
        toBump.push({ id: match.id, next: match.mentionCount + 1 });
      }
      continue;
    }
    if (seenNew.has(compositeKey)) continue; // تكرار داخل نفس الدفعة
    seenNew.add(compositeKey);

    toInsert.push({
      project_id: projectId,
      source_id: sourceId,
      entity_type: ent.entityType,
      name: ent.name,
      normalized_key: ent.normalizedKey,
      description: ent.description,
      confidence: ent.confidence,
      evidence: ent.quote ? [{ quote: ent.quote }] : [],
    });
  }

  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("knowledge_entities")
      .insert(toInsert)
      .select("id, normalized_key");
    if (error) {
      console.error(`[KnowledgeHub] تعذّر إدراج الكيانات: ${error.message}`);
    } else {
      for (const row of (inserted ?? []) as Array<{ id: string; normalized_key: string }>) {
        idByKey.set(row.normalized_key, row.id);
      }
    }
  }

  // تزويد عدّادات الإشارات للكيانات الموجودة.
  await Promise.all(
    toBump.map((b) =>
      supabase.from("knowledge_entities").update({ mention_count: b.next }).eq("id", b.id)
    )
  );

  return idByKey;
}

async function writeRelations(
  supabase: SupabaseClient,
  projectId: string,
  relations: Array<{ fromName: string; toName: string; relationType: string; confidence: number }>,
  entityIdByKey: Map<string, string>
): Promise<number> {
  if (relations.length === 0) return 0;

  const rows = relations
    .map((r) => {
      const fromId = entityIdByKey.get(normalizeEntityKey(r.fromName));
      const toId = entityIdByKey.get(normalizeEntityKey(r.toName));
      if (!fromId || !toId || fromId === toId) return null;
      return {
        project_id: projectId,
        from_entity_id: fromId,
        to_entity_id: toId,
        relation_type: r.relationType,
        confidence: r.confidence,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("knowledge_entity_relations")
    .upsert(rows, { onConflict: "from_entity_id,to_entity_id,relation_type", ignoreDuplicates: true });
  if (error) {
    console.error(`[KnowledgeHub] تعذّر إدراج علاقات الكيانات: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function writeRules(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string | null,
  rules: Array<{ name: string; condition: string; action: string; ruleType: string; scope: string | null; priority: string; confidence: number; quote: string }>
): Promise<number> {
  if (rules.length === 0) return 0;
  const rows = rules.map((r) => ({
    project_id: projectId,
    source_id: sourceId,
    name: r.name,
    condition: r.condition,
    action: r.action,
    rule_type: r.ruleType,
    scope: r.scope,
    priority: r.priority,
    confidence: r.confidence,
    evidence: r.quote ? [{ quote: r.quote }] : [],
  }));
  const { error } = await supabase.from("knowledge_business_rules").insert(rows);
  if (error) {
    console.error(`[KnowledgeHub] تعذّر إدراج قواعد العمل: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function writeWorkflows(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string | null,
  workflows: Array<{ name: string; description: string; trigger: string | null; outcome: string | null; domain: string | null; steps: Array<{ name: string; actor: string | null; condition: string | null; isApproval: boolean }>; confidence: number }>
): Promise<number> {
  if (workflows.length === 0) return 0;
  let count = 0;

  for (const wf of workflows) {
    const { data: inserted, error } = await supabase
      .from("knowledge_workflows")
      .insert({
        project_id: projectId,
        source_id: sourceId,
        name: wf.name,
        description: wf.description,
        trigger: wf.trigger,
        outcome: wf.outcome,
        domain: wf.domain,
        confidence: wf.confidence,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error(`[KnowledgeHub] تعذّر إدراج سير العمل "${wf.name}": ${error?.message}`);
      continue;
    }

    const stepRows = wf.steps.map((s, index) => ({
      workflow_id: inserted.id,
      step_index: index,
      name: s.name,
      actor: s.actor,
      condition: s.condition,
      is_approval: s.isApproval,
    }));
    if (stepRows.length > 0) {
      await supabase.from("knowledge_workflow_steps").insert(stepRows);
    }
    count += 1;
  }
  return count;
}

async function writeRequirements(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string | null,
  requirements: Array<{ requirementType: string; statement: string; rationale: string | null; priority: string; module: string | null; confidence: number; quote: string }>
): Promise<number> {
  if (requirements.length === 0) return 0;
  const rows = requirements.map((r) => ({
    project_id: projectId,
    source_id: sourceId,
    requirement_type: r.requirementType,
    statement: r.statement,
    rationale: r.rationale,
    priority: r.priority,
    module: r.module,
    confidence: r.confidence,
    evidence: r.quote ? [{ quote: r.quote }] : [],
  }));
  const { error } = await supabase.from("knowledge_requirements").insert(rows);
  if (error) {
    console.error(`[KnowledgeHub] تعذّر إدراج المتطلبات: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function writeDecisions(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string | null,
  decisions: Array<{ decision: string; rationale: string | null; decisionMaker: string | null; decidedOn: string | null; impact: string | null; affectedModules: string[]; confidence: number; quote: string }>
): Promise<number> {
  if (decisions.length === 0) return 0;
  const rows = decisions.map((d) => ({
    project_id: projectId,
    source_id: sourceId,
    decision: d.decision,
    rationale: d.rationale,
    decision_maker: d.decisionMaker,
    decided_on: d.decidedOn,
    impact: d.impact,
    affected_modules: d.affectedModules,
    confidence: d.confidence,
    evidence: d.quote ? [{ quote: d.quote }] : [],
  }));
  const { error } = await supabase.from("knowledge_decisions").insert(rows);
  if (error) {
    console.error(`[KnowledgeHub] تعذّر إدراج القرارات: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function writeRisks(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string | null,
  risks: Array<{ riskType: string; description: string; likelihood: string; severity: string; mitigation: string | null; affectedArea: string | null; confidence: number; quote: string }>
): Promise<number> {
  if (risks.length === 0) return 0;
  const rows = risks.map((k) => ({
    project_id: projectId,
    source_id: sourceId,
    risk_type: k.riskType,
    description: k.description,
    likelihood: k.likelihood,
    severity: k.severity,
    mitigation: k.mitigation,
    affected_area: k.affectedArea,
    confidence: k.confidence,
    evidence: k.quote ? [{ quote: k.quote }] : [],
  }));
  const { error } = await supabase.from("knowledge_risks").insert(rows);
  if (error) {
    console.error(`[KnowledgeHub] تعذّر إدراج المخاطر: ${error.message}`);
    return 0;
  }
  return rows.length;
}

// ============================================================
// أدوات
// ============================================================

async function markProcessed(supabase: SupabaseClient, items: KnowledgeItem[]): Promise<void> {
  // عنصرًا عنصرًا لأن الوسوم مصفوفة لكل صف — تحديث جماعي واحد كان هيدوس
  // وسوم مختلفة على بعضها. يتخطّى البوابة عن قصد (ختم تشغيل لا معرفة).
  await Promise.all(
    items.map((item) =>
      supabase
        .from("knowledge_items")
        .update({ tags: [...new Set([...(item.tags ?? []), PROCESSED_TAG])] })
        .eq("id", item.id)
    )
  );
}

async function buildDomainResolver(
  supabase: SupabaseClient,
  items: KnowledgeItem[]
): Promise<(sourceId: string) => string> {
  const ids = [...new Set(items.map((i) => i.source_id))];
  const domainBySource = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("knowledge_sources")
      .select("id, declared_domain")
      .in("id", ids);
    for (const s of (data ?? []) as Array<{ id: string; declared_domain: string | null }>) {
      const d = (s.declared_domain ?? "").trim();
      domainBySource.set(s.id, d || DEFAULT_DOMAIN);
    }
  }
  return (sourceId: string) => domainBySource.get(sourceId) ?? DEFAULT_DOMAIN;
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

async function getProjectName(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined) ?? "المشروع";
}

function emptyCounts() {
  return { entities: 0, relations: 0, rules: 0, workflows: 0, requirements: 0, decisions: 0, risks: 0 };
}
