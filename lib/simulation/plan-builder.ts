import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { parseDatasets } from "@/lib/data-quality/dataset";
import { pickKeyField } from "@/lib/data-quality/duplicate-detection";
import { RULE_STAGE } from "@/lib/transformation/rule-types";
import type { TransformRule, RuleKind, PipelineStage } from "@/lib/transformation/rule-types";
import type { BusinessRule } from "@/lib/transformation/business-rules";
import type { SimulationPlan, EntityPlan, RelationshipSpec } from "./simulation-types";

/**
 * بانِي خطة المحاكاة — الجسر بين مخرَجات المراحل ١-٤ ومحرّك المحاكاة النقي.
 *
 * يقرأ محرّك التحويل **المعتمَد** (المرحلة ٤) + Mapping (المرحلة ٢) +
 * العلاقات (الاكتشاف ١/Mapping ٢)، ويحلّل بيانات العيّنة المُقدَّمة إلى
 * كيانات جاهزة للمحاكاة. **لا يخزّن صفوفًا خام** — كلها في الذاكرة.
 */

const UNDEFINED_TABLE = "42P01";

export interface PlanOutcome {
  ok: boolean;
  plan?: SimulationPlan;
  pipelineId?: string;
  message?: string;
}

function mapRules(rows: Array<Record<string, unknown>>): TransformRule[] {
  return rows.map((r) => ({
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
}

function mapBusinessRules(rows: Array<Record<string, unknown>>): BusinessRule[] {
  return rows.map((b) => ({
    id: String(b.id),
    entity: String(b.entity),
    title: String(b.title),
    condition: b.condition as BusinessRule["condition"],
    action: b.action as BusinessRule["action"],
    confidence: Number(b.confidence),
    reason: String(b.reason ?? ""),
    enabled: Boolean(b.enabled),
  }));
}

/** يخمّن عمود المفتاح الأجنبي في جدول الابن نحو كيان الأب. */
function inferFk(childFields: string[], toEntity: string, toObject: string): string | null {
  const targets = [toEntity, toObject].filter(Boolean).map((s) => s.toLowerCase().replace(/s$/, ""));
  const norm = (f: string) => f.toLowerCase().replace(/[_\s]/g, "");
  for (const f of childFields) {
    const n = norm(f);
    for (const t of targets) {
      if (n === `${t}id` || n === `${t}_id`.replace("_", "") || (n.includes(t) && n.endsWith("id"))) return f;
    }
  }
  return null;
}

export async function buildSimulationPlan(sourceId: string, content: string, sourceType: string, client?: SupabaseClient): Promise<PlanOutcome> {
  const db = client ?? createServiceClient();

  // ١) محرّك التحويل المعتمَد (المرحلة ٤).
  const pipeRes = await db.from("transformation_pipelines").select("id, status, domain, blueprint_id").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (pipeRes.error && pipeRes.error.code === UNDEFINED_TABLE) return { ok: false, message: "جداول المرحلة ٤ غير مطبَّقة (0086)." };
  if (!pipeRes.data) return { ok: false, message: "لا يوجد محرّك تحويل لهذا المصدر — ابنِه في المرحلة ٤ أولًا." };
  const pipeline = pipeRes.data as { id: string; status: string; domain: string | null; blueprint_id: string | null };
  if (pipeline.status !== "approved") return { ok: false, message: "محرّك التحويل غير معتمَد — اعتمده في المرحلة ٤ قبل المحاكاة." };

  const [rulesRes, brRes] = await Promise.all([
    db.from("transformation_rules").select("*").eq("pipeline_id", pipeline.id).eq("enabled", true).neq("status", "rejected"),
    db.from("transformation_business_rules").select("*").eq("pipeline_id", pipeline.id).eq("enabled", true).neq("status", "rejected"),
  ]);
  const rules = mapRules((rulesRes.data ?? []) as Array<Record<string, unknown>>);
  const businessRules = mapBusinessRules((brRes.data ?? []) as Array<Record<string, unknown>>);

  // ٢) Mapping (المرحلة ٢): الكيانات + العلاقات.
  let entityMap: Array<{ entity: string; label: string; oldObjects: string[] }> = [];
  let relMappings: Array<{ from_object: string; to_object: string; from_entity: string | null; to_entity: string | null; new_kind: string }> = [];
  if (pipeline.blueprint_id) {
    const [emRes, rmRes] = await Promise.all([
      db.from("migration_entity_mappings").select("canonical_entity, canonical_label, old_objects").eq("blueprint_id", pipeline.blueprint_id),
      db.from("migration_relationship_mappings").select("from_object, to_object, from_entity, to_entity, new_kind").eq("blueprint_id", pipeline.blueprint_id),
    ]);
    entityMap = ((emRes.data ?? []) as Array<{ canonical_entity: string; canonical_label: string | null; old_objects: string[] | null }>).map((e) => ({
      entity: e.canonical_entity, label: e.canonical_label ?? e.canonical_entity, oldObjects: e.old_objects ?? [],
    }));
    relMappings = (rmRes.data ?? []) as typeof relMappings;
  }

  // خريطة oldObject → (entity,label).
  const oldToEntity = new Map<string, { entity: string; label: string }>();
  for (const em of entityMap) for (const o of em.oldObjects) oldToEntity.set(o.toLowerCase(), { entity: em.entity, label: em.label });

  // ٣) تحليل بيانات العيّنة إلى كيانات.
  const datasets = parseDatasets(sourceType, content, "dataset");
  if (Object.keys(datasets).length === 0) return { ok: false, message: "لا بيانات في العيّنة — الصق تصدير النظام القديم (CSV/JSON)." };

  const planByEntity = new Map<string, EntityPlan>();
  const entityFields = new Map<string, string[]>();
  const entityOldObject = new Map<string, string>();

  for (const [dsName, ds] of Object.entries(datasets)) {
    if (ds.rows.length === 0) continue;
    const resolved = oldToEntity.get(dsName.toLowerCase());
    const entity = resolved?.entity ?? dsName;
    const label = resolved?.label ?? dsName;
    const keyField = pickKeyField(ds.fields);
    const applicable = rules.filter((r) => r.sourceFields.some((f) => ds.fields.includes(f)) || ds.fields.includes(r.targetField));

    const existing = planByEntity.get(entity);
    if (existing) {
      existing.rows.push(...ds.rows);
    } else {
      planByEntity.set(entity, { entity, label, keyField, rules: applicable, rows: [...ds.rows] });
      entityFields.set(entity, ds.fields);
      entityOldObject.set(entity, dsName);
    }
  }

  if (planByEntity.size === 0) return { ok: false, message: "تعذّر تحليل أي كيان من العيّنة." };

  // ٤) العلاقات → RelationshipSpec مع تخمين عمود FK.
  const relationships: RelationshipSpec[] = [];
  for (const rm of relMappings) {
    const fromEntity = rm.from_entity ?? oldToEntity.get(rm.from_object.toLowerCase())?.entity ?? rm.from_object;
    const toEntity = rm.to_entity ?? oldToEntity.get(rm.to_object.toLowerCase())?.entity ?? rm.to_object;
    if (!planByEntity.has(fromEntity) || !planByEntity.has(toEntity)) continue;
    const childFields = entityFields.get(fromEntity) ?? [];
    const fk = inferFk(childFields, toEntity, rm.to_object);
    relationships.push({
      fromEntity,
      toEntity,
      kind: (rm.new_kind as RelationshipSpec["kind"]) ?? "weak",
      viaColumns: fk ? [fk] : [],
      confidence: 70,
    });
  }

  return {
    ok: true,
    pipelineId: pipeline.id,
    plan: { entities: [...planByEntity.values()], businessRules, relationships, domain: pipeline.domain ?? "generic" },
  };
}
