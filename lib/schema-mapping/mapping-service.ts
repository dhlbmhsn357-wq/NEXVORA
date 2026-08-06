import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildSchemaMappingPrompt } from "@/lib/ai/prompts/schema-mapping";
import { validateSchemaMapping } from "@/lib/ai/validation/schema-mapping";
import { analyzeDependencies } from "@/lib/migration-discovery/relationship-intelligence";
import type { NormalizedSchema } from "@/lib/migration-discovery/schema-model";
import { buildBlueprint, summarizeBlueprint, type MigrationBlueprint } from "./blueprint";
import { CANONICAL_ENTITIES } from "./canonical-model";
import { needsReview } from "./confidence";
import { inferTransformation } from "./transformation-rules";
import { getCanonicalEntity } from "./canonical-model";
import type { MappingOutcome } from "./types";

/**
 * خدمة الـMapping — تولّد Migration Blueprint من أحدث لقطة لمصدر (المرحلة
 * ١)، تشغّل المطابقة الحتمية، تهذّبها بالذكاء الاصطناعي للحقول منخفضة
 * الثقة، وتحفظ كل المطابقات + إصدارًا. **لا ترحيل** — بناء فهم فقط.
 */

const UNDEFINED_TABLE = "42P01";
function isMissingTable(e: { code?: string } | null): boolean {
  return e?.code === UNDEFINED_TABLE;
}

export async function generateBlueprint(
  sourceId: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<MappingOutcome> {
  const db = client ?? createServiceClient();

  // أحدث لقطة مكتملة للمصدر (من المرحلة ١).
  const snapRes = await db
    .from("migration_snapshots")
    .select("id, project_id, raw_schema")
    .eq("source_id", sourceId)
    .eq("status", "completed")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapRes.error && isMissingTable(snapRes.error)) return { ok: false, message: "جداول المرحلة ١ غير مطبَّقة (0083)." };
  if (!snapRes.data) return { ok: false, message: "لا توجد لقطة تحليل مكتملة لهذا المصدر — شغّل تحليل المرحلة ١ أولًا." };

  const snapshot = snapRes.data as { id: string; project_id: string | null; raw_schema: NormalizedSchema };
  const schema = snapshot.raw_schema;
  if (!schema?.objects?.length) return { ok: false, message: "بنية اللقطة فارغة." };

  const dependencies = analyzeDependencies(schema);
  const blueprint: MigrationBlueprint & { aiNote?: string } = buildBlueprint({ schema, dependencies });

  // تهذيب الذكاء الاصطناعي للحقول منخفضة الثقة/غير المطابَقة (رشيق).
  await applyAiRefinement(blueprint, db, actorId, snapshot.project_id);

  // recompute confidence avg after refinement.
  const confVals = [...blueprint.entityMappings.map((e) => e.confidence), ...blueprint.fieldMappings.filter((f) => f.newField).map((f) => f.confidence)];
  blueprint.stats.confidenceAvg = confVals.length ? Math.round(confVals.reduce((s, v) => s + v, 0) / confVals.length) : 0;
  blueprint.stats.reviewCount = blueprint.entityMappings.filter((e) => needsReview(e.confidence)).length + blueprint.fieldMappings.filter((f) => f.newField && needsReview(f.confidence)).length;

  // إصدار تالٍ.
  const lastVer = await db.from("migration_blueprints").select("version").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((lastVer.data as { version: number } | null)?.version ?? 0) + 1;

  const bpRes = await db
    .from("migration_blueprints")
    .insert({
      source_id: sourceId,
      snapshot_id: snapshot.id,
      project_id: snapshot.project_id,
      status: "in_review",
      version,
      confidence_avg: blueprint.stats.confidenceAvg,
      complexity: blueprint.complexity,
      detected_template: blueprint.detectedTemplate?.key ?? null,
      stats: blueprint.stats,
      ai_summary: blueprint.aiNote ?? "",
      recommendations: blueprint.recommendations,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (bpRes.error || !bpRes.data) return { ok: false, message: bpRes.error?.message ?? "فشل إنشاء المخطّط." };
  const blueprintId = (bpRes.data as { id: string }).id;

  await persistBlueprint(blueprintId, blueprint, db);

  // إصدار للتاريخ/التراجع.
  await db.from("migration_blueprint_versions").insert({
    blueprint_id: blueprintId,
    version,
    action: "generated",
    snapshot: blueprint.stats,
    actor_id: actorId,
  });

  return { ok: true, blueprintId };
}

/** يحفظ كل صفوف المطابقة للمخطّط. */
async function persistBlueprint(blueprintId: string, bp: MigrationBlueprint, db: SupabaseClient): Promise<void> {
  const entityRows = bp.entityMappings.map((e) => ({
    blueprint_id: blueprintId,
    old_objects: e.oldObjects,
    canonical_entity: e.canonicalEntity,
    canonical_label: e.canonicalLabel,
    confidence: e.confidence,
    reason: e.reason,
    alternatives: e.alternatives,
    status: needsReview(e.confidence) ? "pending" : "approved",
  }));
  if (entityRows.length) await db.from("migration_entity_mappings").insert(entityRows);

  const fieldRows = bp.fieldMappings.map((f) => ({
    blueprint_id: blueprintId,
    old_object: f.oldObject,
    old_field: f.oldField,
    new_entity: f.newEntity,
    new_field: f.newField,
    new_field_label: f.newFieldLabel,
    kind: f.kind,
    transformation: f.transformation,
    confidence: f.confidence,
    reason: f.reason,
    suggestions: f.suggestions,
    status: f.newField && !needsReview(f.confidence) ? "approved" : "pending",
  }));
  if (fieldRows.length) {
    // إدراج على دفعات (أداء لآلاف الحقول).
    for (let i = 0; i < fieldRows.length; i += 500) await db.from("migration_field_mappings").insert(fieldRows.slice(i, i + 500));
  }

  const relRows = bp.relationshipMappings.map((r) => ({
    blueprint_id: blueprintId,
    from_object: r.fromObject,
    to_object: r.toObject,
    from_entity: r.fromEntity,
    to_entity: r.toEntity,
    old_kind: r.oldKind,
    new_kind: r.newKind,
    confidence: r.confidence,
    note: r.note,
  }));
  if (relRows.length) await db.from("migration_relationship_mappings").insert(relRows);

  const ruleRows = [
    ...bp.businessRules.map((r) => ({ blueprint_id: blueprintId, rule_type: "business_rule", condition: r.condition, result: r.result, detail: {}, confidence: r.confidence })),
    ...bp.workflowMappings.map((w) => ({ blueprint_id: blueprintId, rule_type: "workflow", condition: w.entity, result: w.note, detail: { oldSteps: w.oldSteps }, confidence: 60 })),
  ];
  if (ruleRows.length) await db.from("migration_mapping_rules").insert(ruleRows);

  const conflictRows = bp.conflicts.map((c) => ({ blueprint_id: blueprintId, conflict_type: c.type, subject: c.subject, detail: c.detail }));
  if (conflictRows.length) for (let i = 0; i < conflictRows.length; i += 500) await db.from("migration_mapping_conflicts").insert(conflictRows.slice(i, i + 500));
}

/** يهذّب الحقول منخفضة الثقة بالذكاء الاصطناعي ويطبّق اقتراحاته على المخطّط في الذاكرة. */
async function applyAiRefinement(bp: MigrationBlueprint & { aiNote?: string }, db: SupabaseClient, actorId: string | null, projectId: string | null): Promise<void> {
  const lowConf = bp.fieldMappings.filter((f) => !f.newField || needsReview(f.confidence));
  if (lowConf.length === 0) return;

  try {
    const targetFields: Record<string, string[]> = {};
    for (const em of bp.entityMappings) {
      const def = getCanonicalEntity(em.canonicalEntity);
      if (def) targetFields[em.canonicalEntity] = def.fields.map((f) => f.key);
    }
    const prompt = buildSchemaMappingPrompt(summarizeBlueprint(bp), targetFields, "");
    const resp = await AIService.execute(AITaskType.SCHEMA_MAPPING_ANALYSIS, prompt, { actorId: actorId ?? undefined, projectId: projectId ?? undefined });
    if (!resp.success) return;
    const v = validateSchemaMapping(resp.output);
    if (!v.ok) return;

    bp.aiNote = v.data.overall_note;
    const byKey = new Map(bp.fieldMappings.map((f) => [`${f.oldObject}::${f.oldField}`, f]));
    for (const s of v.data.suggestions) {
      const fm = byKey.get(`${s.old_object}::${s.old_field}`);
      if (!fm || !s.new_field) continue;
      const def = getCanonicalEntity(fm.newEntity);
      const targetField = def?.fields.find((f) => f.key === s.new_field);
      if (!targetField) continue; // AI لا يخترع حقولًا
      // طبّق فقط لو حسّن الثقة.
      if (s.confidence > fm.confidence) {
        fm.newField = targetField.key;
        fm.newFieldLabel = targetField.label;
        fm.confidence = s.confidence;
        fm.kind = fm.kind === "unmapped" ? "direct" : fm.kind;
        fm.reason = `${s.reason} (تهذيب الذكاء الاصطناعي)`;
        fm.transformation = inferTransformation(
          { name: fm.oldField, dataType: "unknown", nullable: true, isPrimaryKey: false, isForeignKey: false, isAutoIncrement: false, defaultValue: null, references: null },
          targetField
        );
      }
    }
  } catch {
    /* التهذيب تحسين لا شرط */
  }
}

/** أحدث مخطّط لمصدر + مطابقاته — للعرض. */
export async function getBlueprintDetail(sourceId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const bp = await db.from("migration_blueprints").select("*").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (bp.error || !bp.data) return null;
  const blueprintId = (bp.data as { id: string }).id;
  const [entities, fields, relationships, rules, conflicts] = await Promise.all([
    db.from("migration_entity_mappings").select("*").eq("blueprint_id", blueprintId).order("confidence", { ascending: false }),
    db.from("migration_field_mappings").select("*").eq("blueprint_id", blueprintId).order("confidence", { ascending: true }),
    db.from("migration_relationship_mappings").select("*").eq("blueprint_id", blueprintId),
    db.from("migration_mapping_rules").select("*").eq("blueprint_id", blueprintId),
    db.from("migration_mapping_conflicts").select("*").eq("blueprint_id", blueprintId).eq("resolved", false),
  ]);
  return {
    blueprint: bp.data,
    entities: entities.data ?? [],
    fields: fields.data ?? [],
    relationships: relationships.data ?? [],
    rules: rules.data ?? [],
    conflicts: conflicts.data ?? [],
  };
}

/** كتالوج الحقول القياسية — للعرض/التعديل اليدوي في الواجهة. */
export function canonicalFieldCatalog(): Record<string, Array<{ key: string; label: string }>> {
  const out: Record<string, Array<{ key: string; label: string }>> = {};
  for (const e of CANONICAL_ENTITIES) out[e.entity] = e.fields.map((f) => ({ key: f.key, label: f.label }));
  return out;
}
