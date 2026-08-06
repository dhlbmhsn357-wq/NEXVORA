import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { parseDataset } from "@/lib/data-quality/dataset";
import { previewPipeline, type RowTransformResult } from "./pipeline";
import type { TransformRule, RuleKind, PipelineStage } from "./rule-types";
import { RULE_STAGE } from "./rule-types";
import type { BusinessRule } from "./business-rules";

/**
 * معاينة التحويل — يطبّق قواعد الـPipeline على **عيّنة** من بيانات
 * مُقدَّمة (لا Production) ويرجّع أثر قديم→جديد+قاعدة+سبب+ثقة لكل خلية.
 */

export async function previewSource(
  sourceId: string,
  sourceType: string,
  content: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; results?: RowTransformResult[]; message?: string }> {
  const db = client ?? createServiceClient();
  const pipe = await db.from("transformation_pipelines").select("id").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!pipe.data) return { ok: false, message: "لا يوجد محرّك تحويل لهذا المصدر — ابنِه أولًا." };
  const pipelineId = (pipe.data as { id: string }).id;

  const [rulesRes, brRes] = await Promise.all([
    db.from("transformation_rules").select("*").eq("pipeline_id", pipelineId).eq("enabled", true),
    db.from("transformation_business_rules").select("*").eq("pipeline_id", pipelineId).eq("enabled", true),
  ]);

  const rules: TransformRule[] = ((rulesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    targetField: String(r.target_field),
    sourceFields: (r.source_fields as string[]) ?? [],
    kind: r.kind as RuleKind,
    stage: (r.stage as PipelineStage) ?? RULE_STAGE[r.kind as RuleKind],
    config: (r.config as Record<string, unknown>) ?? {},
    condition: (r.condition as TransformRule["condition"]) ?? undefined,
    confidence: Number(r.confidence),
    reason: String(r.reason ?? ""),
    enabled: Boolean(r.enabled),
  }));

  const businessRules: BusinessRule[] = ((brRes.data ?? []) as Array<Record<string, unknown>>).map((b) => ({
    id: String(b.id),
    entity: String(b.entity),
    title: String(b.title),
    condition: b.condition as BusinessRule["condition"],
    action: b.action as BusinessRule["action"],
    confidence: Number(b.confidence),
    reason: String(b.reason ?? ""),
    enabled: Boolean(b.enabled),
  }));

  const dataset = parseDataset(sourceType, content, "preview");
  if (dataset.rows.length === 0) return { ok: false, message: "لا صفوف في العيّنة — الصق بيانات فعلية للمعاينة." };

  return { ok: true, results: previewPipeline(rules, businessRules, dataset.rows, 30) };
}
