import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildTransformationRulesPrompt } from "@/lib/ai/prompts/transformation-rules";
import { validateTransformationRules } from "@/lib/ai/validation/transformation-rules";
import { generateRules, type FieldMappingInput } from "./rule-generator";
import { defaultBusinessRules } from "./business-rules";
import { buildReport } from "./report";
import { buildGraph } from "./graph";
import { RULE_LABELS, RULE_STAGE, type TransformRule, type RuleKind } from "./rule-types";
import { needsReview, clampConfidence } from "./confidence";

/**
 * خدمة محرّك التحويل — تبني Pipeline من مخرَجات المرحلة ٢ (Mapping) وتشتقّ
 * القواعد حتميًا، تملأ الفجوات بالذكاء الاصطناعي، وتحفظ القواعد وقواعد
 * العمل والتقرير. **لا تنفيذ على Production** — بناء المحرّك فقط.
 */

const UNDEFINED_TABLE = "42P01";
const ALLOWED_KINDS = new Set(Object.keys(RULE_LABELS));

function isMissingTable(e: { code?: string } | null): boolean {
  return e?.code === UNDEFINED_TABLE;
}

export interface BuildOutcome {
  ok: boolean;
  pipelineId?: string;
  message?: string;
}

export async function buildPipeline(sourceId: string, actorId: string | null, client?: SupabaseClient): Promise<BuildOutcome> {
  const db = client ?? createServiceClient();

  // أحدث مخطّط Mapping للمصدر (المرحلة ٢).
  const bpRes = await db.from("migration_blueprints").select("id, project_id, detected_template").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (bpRes.error && isMissingTable(bpRes.error)) return { ok: false, message: "جداول المرحلة ٢ غير مطبَّقة (0084)." };
  if (!bpRes.data) return { ok: false, message: "لا يوجد Mapping لهذا المصدر — ابنِ Mapping في المرحلة ٢ أولًا." };
  const blueprint = bpRes.data as { id: string; project_id: string | null; detected_template: string | null };

  const [fieldRes, entityRes] = await Promise.all([
    db.from("migration_field_mappings").select("old_object, old_field, new_entity, new_field, kind, transformation, confidence").eq("blueprint_id", blueprint.id),
    db.from("migration_entity_mappings").select("canonical_entity").eq("blueprint_id", blueprint.id),
  ]);
  const fieldRows = (fieldRes.data ?? []) as Array<{ old_object: string; old_field: string; new_entity: string; new_field: string | null; kind: string; transformation: { kind?: string } | null; confidence: number }>;
  if (fieldRows.length === 0) return { ok: false, message: "لا توجد مطابقات حقول في المخطّط." };

  const mappings: FieldMappingInput[] = fieldRows.map((r) => ({
    oldObject: r.old_object,
    oldField: r.old_field,
    newEntity: r.new_entity,
    newField: r.new_field,
    kind: r.kind,
    transformationKind: r.transformation?.kind,
    confidence: r.confidence,
  }));

  const rules = generateRules(mappings);
  const entities = [...new Set(((entityRes.data ?? []) as Array<{ canonical_entity: string }>).map((e) => e.canonical_entity))];
  const businessRules = defaultBusinessRules(entities);

  // فجوات: حقول هدف بلا قاعدة أو منخفضة الثقة.
  await fillGapsWithAi(rules, mappings, blueprint.project_id, actorId, blueprint.detected_template ?? "generic");

  const targetFieldCount = new Set(mappings.filter((m) => m.newField).map((m) => `${m.newEntity}.${m.newField}`)).size;
  const report = buildReport(rules, businessRules, targetFieldCount);
  const graph = buildGraph(rules);

  const lastVer = await db.from("transformation_pipelines").select("version").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((lastVer.data as { version: number } | null)?.version ?? 0) + 1;

  const pipeRes = await db
    .from("transformation_pipelines")
    .insert({
      source_id: sourceId,
      blueprint_id: blueprint.id,
      project_id: blueprint.project_id,
      status: "in_review",
      version,
      domain: blueprint.detected_template ?? "generic",
      confidence_avg: report.stats.confidenceAvg,
      coverage: report.coverage,
      complexity: report.complexity,
      report: { ...report, graph },
      recommendations: report.recommendations,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (pipeRes.error || !pipeRes.data) {
    if (pipeRes.error && isMissingTable(pipeRes.error)) return { ok: false, message: "جداول المرحلة ٤ غير مطبَّقة (طبّق ترحيل 0086)." };
    return { ok: false, message: pipeRes.error?.message ?? "فشل إنشاء الـPipeline." };
  }
  const pipelineId = (pipeRes.data as { id: string }).id;

  const ruleRows = rules.map((r) => ({
    pipeline_id: pipelineId,
    target_field: r.targetField,
    source_fields: r.sourceFields,
    kind: r.kind,
    stage: r.stage,
    config: r.config,
    condition: r.condition ?? null,
    confidence: r.confidence,
    reason: r.reason,
    source: (r as { source?: string }).source ?? "deterministic",
    enabled: r.enabled,
    status: needsReview(r.confidence) ? "pending" : "approved",
  }));
  for (let i = 0; i < ruleRows.length; i += 500) await db.from("transformation_rules").insert(ruleRows.slice(i, i + 500));

  const brRows = businessRules.map((b) => ({
    pipeline_id: pipelineId,
    entity: b.entity,
    title: b.title,
    condition: b.condition,
    action: b.action,
    confidence: b.confidence,
    reason: b.reason,
    enabled: b.enabled,
    status: "pending",
  }));
  if (brRows.length > 0) await db.from("transformation_business_rules").insert(brRows);

  await db.from("transformation_rule_versions").insert({ pipeline_id: pipelineId, version, action: "generated", snapshot: report.stats, actor_id: actorId });

  return { ok: true, pipelineId };
}

async function fillGapsWithAi(rules: TransformRule[], mappings: FieldMappingInput[], projectId: string | null, actorId: string | null, domain: string): Promise<void> {
  const covered = new Set(rules.map((r) => r.targetField));
  const gaps = mappings.filter((m) => m.newField && !covered.has(m.newField));
  const lowConf = rules.filter((r) => needsReview(r.confidence));
  if (gaps.length === 0 && lowConf.length === 0) return;

  try {
    const gapText = [
      ...gaps.map((g) => `- الحقل ${g.newEntity}.${g.newField} من ${g.oldObject}.${g.oldField} (بلا قاعدة)`),
      ...lowConf.map((r) => `- ${r.targetField} (${r.kind}، ثقة ${r.confidence}٪ — منخفضة)`),
    ].join("\n");
    const context = `المجال: ${domain}. عدد المطابقات: ${mappings.length}. القواعد المشتقّة: ${rules.length}.`;
    const prompt = buildTransformationRulesPrompt(context, [...ALLOWED_KINDS], gapText);
    const resp = await AIService.execute(AITaskType.TRANSFORMATION_RULE_GENERATION, prompt, { actorId: actorId ?? undefined, projectId: projectId ?? undefined });
    if (!resp.success) return;
    const v = validateTransformationRules(resp.output, ALLOWED_KINDS);
    if (!v.ok) return;
    let i = rules.length;
    for (const g of v.data.rules) {
      if (covered.has(g.target_field)) continue;
      const kind = g.kind as RuleKind;
      rules.push({
        id: `ai_${++i}`,
        targetField: g.target_field,
        sourceFields: g.source_fields.length ? g.source_fields : [g.target_field],
        kind,
        stage: RULE_STAGE[kind] ?? "normalize",
        config: g.config,
        confidence: clampConfidence(g.confidence),
        reason: `${g.reason} (توليد الذكاء الاصطناعي)`,
        enabled: true,
      });
      covered.add(g.target_field);
    }
  } catch {
    /* التوليد تحسين لا شرط */
  }
}

/** أحدث Pipeline لمصدر + قواعده — للعرض. */
export async function getPipelineDetail(sourceId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const pipe = await db.from("transformation_pipelines").select("*").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (pipe.error || !pipe.data) return null;
  const pipelineId = (pipe.data as { id: string }).id;
  const [rules, businessRules] = await Promise.all([
    db.from("transformation_rules").select("*").eq("pipeline_id", pipelineId).order("stage", { ascending: true }),
    db.from("transformation_business_rules").select("*").eq("pipeline_id", pipelineId),
  ]);
  return { pipeline: pipe.data, rules: rules.data ?? [], businessRules: businessRules.data ?? [] };
}
