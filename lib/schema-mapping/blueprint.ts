import type { NormalizedSchema } from "@/lib/migration-discovery/schema-model";
import type { DependencyReport } from "@/lib/migration-discovery/relationship-intelligence";
import { matchEntities, type EntityMappingCandidate, type UnmappedObject } from "./entity-matcher";
import { matchFields, detectSplitMerge, type FieldMapping } from "./field-matcher";
import { mapRelationships, type RelationshipMapping } from "./relationship-mapper";
import { detectConflicts, type MappingConflict } from "./conflict-detector";
import { detectSourceSignature } from "./templates";
import { needsReview, clampConfidence } from "./confidence";

/**
 * مُركِّب الـMigration Blueprint — **وحدة نقية بلا I/O**.
 *
 * يركّب كل محرّكات المطابقة (كيانات/حقول/علاقات/تعارضات/تحويلات) في
 * مخطّط ترحيل واحد شامل — **حتمي بالكامل**، وهو المرجع الرسمي لمراحل
 * الترحيل التالية. لا يرحّل بيانات: يبني الفهم فقط.
 */

export interface WorkflowMapping {
  entity: string;
  oldSteps: string[];
  note: string;
}

export interface BusinessRuleMapping {
  condition: string;
  result: string;
  confidence: number;
}

export interface MigrationBlueprint {
  entityMappings: EntityMappingCandidate[];
  fieldMappings: FieldMapping[];
  relationshipMappings: RelationshipMapping[];
  businessRules: BusinessRuleMapping[];
  workflowMappings: WorkflowMapping[];
  conflicts: MappingConflict[];
  unmappedObjects: UnmappedObject[];
  reviewQueue: Array<{ kind: "entity" | "field"; subject: string; confidence: number }>;
  detectedTemplate: { key: string; label: string; matches: number } | null;
  stats: {
    objects: number;
    entities: number;
    fields: number;
    mappedFields: number;
    relationships: number;
    rules: number;
    confidenceAvg: number;
    reviewCount: number;
  };
  complexity: "low" | "medium" | "high" | "very_high";
  recommendations: string[];
}

export interface BlueprintInput {
  schema: NormalizedSchema;
  dependencies: DependencyReport;
}

export function buildBlueprint({ schema, dependencies }: BlueprintInput): MigrationBlueprint {
  const { mappings: entityMappings, unmapped } = matchEntities(schema);

  // مطابقة حقول كل جدول مع الكيان القياسي المطابق له.
  const objToEntity = new Map<string, EntityMappingCandidate>();
  for (const em of entityMappings) for (const obj of em.oldObjects) objToEntity.set(obj.toLowerCase(), em);

  let fieldMappings: FieldMapping[] = [];
  for (const obj of schema.objects) {
    const em = objToEntity.get(obj.name.toLowerCase());
    if (!em) continue;
    fieldMappings.push(...matchFields(obj, em.canonicalEntity));
  }
  fieldMappings = detectSplitMerge(fieldMappings);

  const relationshipMappings = mapRelationships(dependencies.relationships, entityMappings);
  const conflicts = detectConflicts(entityMappings, fieldMappings, unmapped);
  const businessRules = extractBusinessRules(schema);
  const workflowMappings = extractWorkflows(schema);
  const detectedTemplate = detectSourceSignature(schema);

  const reviewQueue: MigrationBlueprint["reviewQueue"] = [];
  for (const em of entityMappings) if (needsReview(em.confidence)) reviewQueue.push({ kind: "entity", subject: em.canonicalEntity, confidence: em.confidence });
  for (const fm of fieldMappings) if (fm.newField && needsReview(fm.confidence)) reviewQueue.push({ kind: "field", subject: `${fm.oldObject}.${fm.oldField}`, confidence: fm.confidence });

  const mappedFields = fieldMappings.filter((f) => f.newField).length;
  const confidenceValues = [...entityMappings.map((e) => e.confidence), ...fieldMappings.filter((f) => f.newField).map((f) => f.confidence)];
  const confidenceAvg = confidenceValues.length > 0 ? clampConfidence(confidenceValues.reduce((s, v) => s + v, 0) / confidenceValues.length) : 0;

  const complexity = estimateComplexity(entityMappings.length, fieldMappings.length, relationshipMappings.length, conflicts.length);
  const recommendations = buildRecommendations(reviewQueue.length, conflicts, detectedTemplate);

  return {
    entityMappings,
    fieldMappings,
    relationshipMappings,
    businessRules,
    workflowMappings,
    conflicts,
    unmappedObjects: unmapped,
    reviewQueue,
    detectedTemplate,
    stats: {
      objects: schema.objects.length,
      entities: entityMappings.length,
      fields: fieldMappings.length,
      mappedFields,
      relationships: relationshipMappings.length,
      rules: businessRules.length,
      confidenceAvg,
      reviewCount: reviewQueue.length,
    },
    complexity,
    recommendations,
  };
}

/** استخراج قواعد عمل حتمية من تركيبات أعمدة الحالة/الدفع. */
function extractBusinessRules(schema: NormalizedSchema): BusinessRuleMapping[] {
  const rules: BusinessRuleMapping[] = [];
  for (const obj of schema.objects) {
    const names = obj.columns.map((c) => c.name.toLowerCase());
    const hasStatus = names.some((n) => /(status|state|حالة)/.test(n));
    const hasPayment = names.some((n) => /(payment|paid|amount_paid|مدفوع)/.test(n));
    if (hasStatus && hasPayment) {
      rules.push({
        condition: `${obj.name}: الحالة = مغلق و الدفع = مدفوع`,
        result: "طلب مكتمل (Completed) في النظام الجديد.",
        confidence: 70,
      });
    }
  }
  return rules;
}

/** استخراج تدفّق مبدئي من أعمدة الحالة (تُثرى بالذكاء الاصطناعي لاحقًا). */
function extractWorkflows(schema: NormalizedSchema): WorkflowMapping[] {
  const flows: WorkflowMapping[] = [];
  for (const obj of schema.objects) {
    const statusCol = obj.columns.find((c) => /(status|state|حالة)/.test(c.name.toLowerCase()));
    if (statusCol) {
      flows.push({
        entity: obj.name,
        oldSteps: [statusCol.name],
        note: "سير عمل مبدئي مستنتَج من عمود الحالة — راجع خطواته ومطابقتها بالنظام الجديد.",
      });
    }
  }
  return flows;
}

function estimateComplexity(entities: number, fields: number, rels: number, conflicts: number): MigrationBlueprint["complexity"] {
  const score = entities * 2 + fields * 0.4 + rels + conflicts * 1.5;
  if (score >= 120) return "very_high";
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function buildRecommendations(reviewCount: number, conflicts: MappingConflict[], template: MigrationBlueprint["detectedTemplate"]): string[] {
  const recs: string[] = [];
  if (template) recs.push(`اكتُشفت بصمة «${template.label}» — فكّر في تطبيق قالب Mapping جاهز لتسريع المراجعة.`);
  if (reviewCount > 0) recs.push(`${reviewCount} عنصر بثقة أقل من ٩٠٪ يحتاج مراجعة بشرية قبل الاعتماد.`);
  const unmappedNew = conflicts.filter((c) => c.type === "unmapped_new").length;
  if (unmappedNew > 0) recs.push(`${unmappedNew} حقل مطلوب في النظام الجديد بلا مصدر — حدّد قيمًا افتراضية.`);
  const unusedOld = conflicts.filter((c) => c.type === "unused_old").length;
  if (unusedOld > 0) recs.push(`${unusedOld} جدول قديم بلا مطابقة — قرّر هل يُرحَّل أم يُهمَل.`);
  if (recs.length === 0) recs.push("المخطّط متّسق بثقة عالية — جاهز للاعتماد بعد مراجعة سريعة.");
  return recs;
}

/** ملخّص مضغوط للمخطّط — يُمرَّر لتهذيب الذكاء الاصطناعي. */
export function summarizeBlueprint(bp: MigrationBlueprint): string {
  const lines: string[] = [];
  lines.push(`الكيانات (${bp.entityMappings.length}): ${bp.entityMappings.map((e) => `${e.oldObjects.join("+")}→${e.canonicalEntity}(${e.confidence}%)`).join(" | ")}`);
  lines.push(`الحقول: ${bp.stats.mappedFields}/${bp.stats.fields} مطابَقة، متوسّط ثقة ${bp.stats.confidenceAvg}%.`);
  lines.push(`في قائمة المراجعة: ${bp.reviewQueue.length}. التعارضات: ${bp.conflicts.length}.`);
  lines.push(`القالب المكتشَف: ${bp.detectedTemplate?.label ?? "لا شيء"}. التعقيد: ${bp.complexity}.`);
  const lowConf = bp.fieldMappings.filter((f) => f.newField && f.confidence < 90).slice(0, 15);
  if (lowConf.length > 0) {
    lines.push(`حقول منخفضة الثقة تحتاج قرارًا: ${lowConf.map((f) => `${f.oldObject}.${f.oldField}→${f.newField}(${f.confidence}%)`).join(" | ")}`);
  }
  const unmapped = bp.fieldMappings.filter((f) => !f.newField).slice(0, 15);
  if (unmapped.length > 0) lines.push(`حقول بلا مطابقة: ${unmapped.map((f) => `${f.oldObject}.${f.oldField}`).join("، ")}`);
  return lines.join("\n");
}
