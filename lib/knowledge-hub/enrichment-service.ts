import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recordBulkCreation, recordBulkTransition, type BulkCreatedItem } from "./repository";
import { truncateForLog } from "@/lib/observability/safe-log";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildKnowledgeEnrichmentPrompt } from "@/lib/ai/prompts/knowledge-enrichment";
import { validateKnowledgeEnrichment } from "@/lib/ai/validation/knowledge-enrichment";
import {
  findDuplicateGroups,
  findRelationCandidates,
  type ComparableItem,
} from "./similarity";
import { listItems, type KnowledgeItem } from "./service";

/**
 * محرّك الإثراء والربط.
 *
 * الدورة لكل تصنيف: دمج التكرار حتميًا → ترشيح الأزواج المتقاربة →
 * استدعاء واحد للنموذج → كتابة العلاقات والتعارضات والمصطلحات.
 *
 * ترتيب الخطوات ده مقصود: الدمج الحتمي بيحصل **قبل** استدعاء النموذج،
 * فالعناصر المكرّرة مابتدخلش في الحساب أصلًا. من غير كده كان النموذج
 * هيشوف نفس المعلومة خمس مرات من خمس مستندات ويطلّع ٢٠ علاقة بينهم
 * كلها بلا قيمة.
 *
 * تصنيف واحد لكل استدعاء — نفس مبدأ باقي المحرّكات في المشروع: كل
 * استدعاء يفضل جوّه حد وقت التنفيذ الآمن، والواجهة بتدفع اللي بعده.
 */

/** أقل عدد عناصر في تصنيف يستاهل استدعاء للنموذج. */
const MIN_ITEMS_FOR_ENRICHMENT = 2;

/** أقصى عدد عناصر بيتبعت في استدعاء واحد. */
const MAX_ITEMS_PER_CALL = 40;

export interface EnrichmentOutcome {
  status: "idle" | "enriched" | "failed";
  category?: string;
  mergedCount?: number;
  relationsAdded?: number;
  conflictsAdded?: number;
  glossaryAdded?: number;
  remainingCategories?: number;
  message?: string;
}

function toComparable(item: KnowledgeItem): ComparableItem {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    content: item.content,
    confidence: item.confidence,
    created_at: item.created_at,
  };
}

/**
 * التصنيفات اللي لسه ما اتعملهاش إثراء.
 *
 * العلامة بتتحط على العنصر نفسه في `tags` بدل عمود جديد، عشان نفضل على
 * هجرة 0071 من غير ما نضيف واحدة جديدة. العنصر اللي اتعمله إثراء بياخد
 * الوسم `enriched`.
 */
export const ENRICHED_TAG = "enriched";

function pendingCategories(items: KnowledgeItem[]): Map<string, KnowledgeItem[]> {
  const byCategory = new Map<string, KnowledgeItem[]>();
  for (const item of items) {
    if (item.tags?.includes(ENRICHED_TAG)) continue;
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return byCategory;
}

async function markEnriched(
  supabase: SupabaseClient,
  items: KnowledgeItem[]
): Promise<void> {
  // التعليم بيحصل عنصرًا عنصرًا لأن الوسوم مصفوفة لكل صف — تحديث جماعي
  // واحد كان هيدوس وسوم مختلفة على بعضها.
  // ختم وسم معالجة داخلي — **لا يمرّ من البوابة عن قصد**.
  //
  // الوسوم من حقول الإصدار، فتمريرها من `updateItem` كان هيولّد
  // إصدارًا لكل ختم. الختم ده علامة تشغيل («العنصر ده اتعالج») لا
  // تغيير في المعرفة نفسها، وتسجيله كإصدار كان هيملأ التاريخ بضجيج
  // يخفي التعديلات الحقيقية.
  await Promise.all(
    items.map((item) =>
      supabase
        .from("knowledge_items")
        .update({ tags: [...new Set([...(item.tags ?? []), ENRICHED_TAG])] })
        .eq("id", item.id)
    )
  );
}

/**
 * يدمج مجموعات التكرار: العنصر الأساسي يفضل، والباقي بياخد حالة `merged`
 * ويشاور عليه. مابنحذفش — الأصل بيفضل موجود مع دليله ومصدره، وده مهم
 * لو الـ PM حب يراجع القرار.
 */
async function applyDuplicateMerges(
  supabase: SupabaseClient,
  projectId: string,
  items: KnowledgeItem[]
): Promise<number> {
  const groups = findDuplicateGroups(items.map(toComparable));
  if (groups.length === 0) return 0;

  let merged = 0;
  for (const group of groups) {
    const { error } = await supabase
      .from("knowledge_items")
      .update({ status: "merged", merged_into: group.canonicalId })
      .in("id", group.duplicateIds);
    if (error) {
      console.error(`[KnowledgeHub] تعذّر دمج التكرار في المشروع ${projectId}: ${error.message}`);
      continue;
    }

    // الحالة مش من حقول الإصدار — التوثيق في الخط الزمني بس.
    await recordBulkTransition({
      projectId,
      itemIds: group.duplicateIds,
      to: "merged",
      actorKind: "worker",
      summary: `اندمج ${group.duplicateIds.length} عنصر مكرَّر`,
    });

    // العلاقة بتتسجّل صراحةً عشان الشبكة تفضل تقول "دول كانوا مكرّرين"
    // بدل ما الربط ده يضيع في عمود مخفي.
    await supabase.from("knowledge_item_relations").upsert(
      group.duplicateIds.map((dupId) => ({
        project_id: projectId,
        from_item_id: dupId,
        to_item_id: group.canonicalId,
        relation_type: "duplicates",
        rationale: `تشابه حتمي بدرجة ${Math.round(group.score * 100)}%.`,
        confidence: Math.round(group.score * 100),
      })),
      { onConflict: "from_item_id,to_item_id,relation_type", ignoreDuplicates: true }
    );

    merged += group.duplicateIds.length;
  }
  return merged;
}

/**
 * يعالج تصنيفًا واحدًا. بيرجّع `idle` لما مفيش تصنيف محتاج إثراء.
 */
export async function enrichNextCategory(
  projectId: string,
  actorId?: string | null
): Promise<EnrichmentOutcome> {
  const supabase = createServiceClient();

  const allItems = await listItems(supabase, projectId, 2000);
  const pending = pendingCategories(allItems);
  if (pending.size === 0) return { status: "idle" };

  // نبدأ بالتصنيف الأكبر: هو اللي فيه أعلى احتمال تكرار وتعارض.
  const [category, categoryItems] = [...pending.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )[0];

  try {
    // --- 1) الدمج الحتمي أولًا ---
    const mergedCount = await applyDuplicateMerges(supabase, projectId, categoryItems);

    // العناصر اللي اندمجت اتشالت من الحساب — بنعيد القراءة بدل ما نشتغل
    // على نسخة قديمة فنبعت للنموذج عناصر احنا لسه دامجينها.
    const survivors = categoryItems.filter(
      (item) => !allItems.some((i) => i.id === item.id && i.status !== "active")
    );
    const fresh = mergedCount > 0 ? await listItems(supabase, projectId, 2000) : allItems;
    const active = fresh.filter((i) => i.category === category && i.status === "active");
    const working = (active.length > 0 ? active : survivors).slice(0, MAX_ITEMS_PER_CALL);

    if (working.length < MIN_ITEMS_FOR_ENRICHMENT) {
      await markEnriched(supabase, working);
      return {
        status: "enriched",
        category,
        mergedCount,
        relationsAdded: 0,
        conflictsAdded: 0,
        glossaryAdded: 0,
        remainingCategories: pending.size - 1,
      };
    }

    // --- 2) ترشيح الأزواج حتميًا ---
    const comparables = working.map(toComparable);
    const { candidates, truncated } = findRelationCandidates(comparables);
    if (truncated > 0) {
      console.warn(
        `[KnowledgeHub] استُبعد ${truncated} زوج مرشّح في تصنيف ${category} بسبب سقف الأزواج.`
      );
    }

    // --- 3) استدعاء واحد للنموذج ---
    const refById = new Map(working.map((item, i) => [item.id, `I${i + 1}`]));
    const idByRef = new Map([...refById].map(([id, ref]) => [ref, id]));

    const projectName = await getProjectName(supabase, projectId);
    const sourceTitles = await getSourceTitles(supabase, working);

    const prompt = buildKnowledgeEnrichmentPrompt({
      projectName,
      category,
      items: working.map((item) => ({
        ref: refById.get(item.id) as string,
        title: item.title,
        content: item.content,
        sourceLabel: sourceTitles.get(item.source_id) ?? "مصدر غير معروف",
      })),
      pairs: candidates
        .filter((c) => refById.has(c.leftId) && refById.has(c.rightId))
        .map((c) => ({
          leftRef: refById.get(c.leftId) as string,
          rightRef: refById.get(c.rightId) as string,
        })),
    });

    const response = await executeAIWithRateLimitWait(AITaskType.KNOWLEDGE_ENRICHMENT, prompt, {
      actorId: actorId ?? undefined,
      projectId,
    });

    if (!response.success) {
      return {
        status: "failed",
        category,
        message: response.error?.message ?? "فشل إثراء المعرفة.",
      };
    }

    const validation = validateKnowledgeEnrichment(response.output, new Set(idByRef.keys()));
    if (!validation.ok) {
      console.error(
        `[KnowledgeHub] تعذّر فهم نتيجة الإثراء لتصنيف ${category}: ${truncateForLog(validation.reason)}`
      );
      // التصنيف بيتعلّم كمعالَج برضه: الوقوف هنا كان هيخلّي التصنيف ده
      // يتحاول عليه للأبد ويمنع باقي التصنيفات من الدور.
      await markEnriched(supabase, working);
      return {
        status: "enriched",
        category,
        mergedCount,
        relationsAdded: 0,
        conflictsAdded: 0,
        glossaryAdded: 0,
        remainingCategories: pending.size - 1,
      };
    }

    if (validation.data.droppedUnknownRef > 0 || validation.data.droppedSelfLink > 0) {
      console.warn(
        `[KnowledgeHub] أُسقط ${validation.data.droppedUnknownRef} مدخل بمعرّف مجهول و${validation.data.droppedSelfLink} ربط ذاتي في تصنيف ${category}.`
      );
    }

    // --- 4) الكتابة ---
    let relationsAdded = 0;
    if (validation.data.relations.length > 0) {
      const rows = validation.data.relations
        .map((rel) => ({
          project_id: projectId,
          from_item_id: idByRef.get(rel.leftRef) as string,
          to_item_id: idByRef.get(rel.rightRef) as string,
          relation_type: rel.type,
          rationale: rel.rationale,
          confidence: rel.confidence,
        }))
        .filter((r) => r.from_item_id && r.to_item_id);

      const { error } = await supabase
        .from("knowledge_item_relations")
        .upsert(rows, {
          onConflict: "from_item_id,to_item_id,relation_type",
          ignoreDuplicates: true,
        });
      if (!error) relationsAdded = rows.length;
    }

    let conflictsAdded = 0;
    if (validation.data.conflicts.length > 0) {
      const byId = new Map(working.map((i) => [i.id, i]));
      const rows = validation.data.conflicts
        .map((c) => {
          const left = byId.get(idByRef.get(c.leftRef) as string);
          const right = byId.get(idByRef.get(c.rightRef) as string);
          if (!left || !right) return null;
          return {
            project_id: projectId,
            left_item_id: left.id,
            right_item_id: right.id,
            left_label: sourceTitles.get(left.source_id) ?? left.title,
            right_label: sourceTitles.get(right.source_id) ?? right.title,
            left_statement: left.content,
            right_statement: right.content,
            description: c.description,
            severity: c.severity,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        const { error } = await supabase.from("knowledge_conflicts").insert(rows);
        if (!error) conflictsAdded = rows.length;
      }
    }

    let glossaryAdded = 0;
    if (validation.data.glossary.length > 0) {
      // المصطلحات بتتخزّن كعناصر معرفة في تصنيف terminology بدل جدول
      // جديد — فبتستفيد من نفس العرض والبحث والدمج بلا هجرة إضافية.
      const rows = validation.data.glossary.map((term) => ({
        project_id: projectId,
        source_id: working[0].source_id,
        category: "terminology",
        title: term.term,
        content: term.note ? `${term.expansion} — ${term.note}` : term.expansion,
        confidence: 75,
        evidence: [],
        tags: [ENRICHED_TAG, "glossary"],
      }));
      const { data: inserted, error } = await supabase
        .from("knowledge_items")
        .insert(rows)
        .select("id, title, content, category, tags, confidence, content_hash, metadata");
      if (!error) {
        glossaryAdded = rows.length;
        await recordBulkCreation({
          projectId,
          items: (inserted ?? []) as BulkCreatedItem[],
          actorId,
          actorKind: "worker",
          reason: "مصطلحات من الإثراء",
        });
      }
    }

    await markEnriched(supabase, working);

    return {
      status: "enriched",
      category,
      mergedCount,
      relationsAdded,
      conflictsAdded,
      glossaryAdded,
      remainingCategories: pending.size - 1,
    };
  } catch (err) {
    console.error(`[KnowledgeHub] فشل غير متوقع أثناء إثراء تصنيف ${category}:`, err);
    return {
      status: "failed",
      category,
      message: err instanceof Error ? err.message : "خطأ غير متوقع أثناء الإثراء.",
    };
  }
}

async function getProjectName(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined) ?? "المشروع";
}

async function getSourceTitles(
  supabase: SupabaseClient,
  items: KnowledgeItem[]
): Promise<Map<string, string>> {
  const ids = [...new Set(items.map((i) => i.source_id))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("knowledge_sources").select("id, title").in("id", ids);
  return new Map(((data ?? []) as { id: string; title: string }[]).map((s) => [s.id, s.title]));
}

// ============================================================
// قراءة الشبكة والتعارضات
// ============================================================

export interface KnowledgeRelation {
  id: string;
  from_item_id: string;
  to_item_id: string;
  relation_type: string;
  rationale: string;
  confidence: number;
}

export interface KnowledgeConflict {
  id: string;
  left_item_id: string | null;
  right_item_id: string | null;
  left_label: string;
  right_label: string;
  left_statement: string;
  right_statement: string;
  description: string;
  severity: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

export async function listRelations(
  supabase: SupabaseClient,
  projectId: string
): Promise<KnowledgeRelation[]> {
  const { data, error } = await supabase
    .from("knowledge_item_relations")
    .select("*")
    .eq("project_id", projectId)
    .order("confidence", { ascending: false })
    .limit(1000);
  if (error) return [];
  return (data ?? []) as KnowledgeRelation[];
}

export async function listConflicts(
  supabase: SupabaseClient,
  projectId: string
): Promise<KnowledgeConflict[]> {
  const { data, error } = await supabase
    .from("knowledge_conflicts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as KnowledgeConflict[];
}
