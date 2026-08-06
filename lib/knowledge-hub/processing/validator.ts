import {
  ENTITY_TYPES,
  REQUIREMENT_TYPES,
  RISK_TYPES,
  RULE_TYPES,
  normalizeEntityKey,
  type EntityType,
  type Likelihood,
  type RequirementType,
  type RiskType,
  type RuleType,
  type Severity,
} from "./taxonomy";

/**
 * مدقّق مخرَج استخراج ذكاء الأعمال — **وحدة نقية**.
 *
 * ## لماذا مدقّق صارم
 *
 * مخرَج الذكاء الاصطناعي **مصدر غير موثوق** حتى لو أنتجناه بأنفسنا:
 * ممكن يرجّع نوعًا خارج القائمة، أو ثقة فوق المئة، أو قاعدة عمل بلا
 * نتيجة. الكتابة المباشرة لمخرَجه في القاعدة بتنقل عدم اليقين للجداول
 * المهيكلة — والجداول دي أساس قرارات لاحقة.
 *
 * المدقّق **بيصلّح ما يقدر ويسقط ما لا يقدر**: نوع غير معروف يتحوّل
 * لأقرب معروف أو `unknown`، وعنصر ناقص حقلًا جوهريًا يُسقط بلا ما يوقف
 * الباقي. الاستخراج الجزئي أفضل من رفض دفعة كاملة بسبب عنصر واحد.
 */

// ============================================================
// الأنواع المخرَجة
// ============================================================

export interface ExtractedEntity {
  entityType: EntityType;
  name: string;
  normalizedKey: string;
  description: string;
  confidence: number;
  quote: string;
}

export interface ExtractedRelation {
  fromName: string;
  toName: string;
  relationType: string;
  confidence: number;
}

export interface ExtractedRule {
  name: string;
  condition: string;
  action: string;
  ruleType: RuleType;
  scope: string | null;
  priority: "critical" | "high" | "medium" | "low";
  confidence: number;
  quote: string;
}

export interface ExtractedWorkflow {
  name: string;
  description: string;
  trigger: string | null;
  outcome: string | null;
  domain: string | null;
  steps: Array<{ name: string; actor: string | null; condition: string | null; isApproval: boolean }>;
  confidence: number;
}

export interface ExtractedRequirement {
  requirementType: RequirementType;
  statement: string;
  rationale: string | null;
  priority: "must" | "should" | "could" | "wont" | "medium";
  module: string | null;
  confidence: number;
  quote: string;
}

export interface ExtractedDecision {
  decision: string;
  rationale: string | null;
  decisionMaker: string | null;
  decidedOn: string | null;
  impact: string | null;
  affectedModules: string[];
  confidence: number;
  quote: string;
}

export interface ExtractedRisk {
  riskType: RiskType;
  description: string;
  likelihood: Likelihood;
  severity: Severity;
  mitigation: string | null;
  affectedArea: string | null;
  confidence: number;
  quote: string;
}

export interface ProcessingExtract {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  rules: ExtractedRule[];
  workflows: ExtractedWorkflow[];
  requirements: ExtractedRequirement[];
  decisions: ExtractedDecision[];
  risks: ExtractedRisk[];
}

export interface ValidationResult {
  data: ProcessingExtract;
  /** ما أُسقط ولماذا — يُسجَّل عشان الاستخراج يفضل قابلًا للتدقيق. */
  dropped: Array<{ kind: string; reason: string }>;
}

// ============================================================
// التدقيق
// ============================================================

export function validateExtract(raw: unknown): ValidationResult {
  const dropped: Array<{ kind: string; reason: string }> = [];
  const root = isObject(raw) ? raw : {};

  const entities = arrayOf(root.entities).flatMap((e) =>
    validateEntity(e, dropped)
  );
  const entityNames = new Set(entities.map((e) => e.normalizedKey));

  return {
    data: {
      entities,
      // العلاقة اللي طرفها كيان مش مستخرَج تُسقط: العقدة اللي بتشير
      // لعدم بتكسر الرسم البياني.
      relations: arrayOf(root.relations).flatMap((r) =>
        validateRelation(r, entityNames, dropped)
      ),
      rules: arrayOf(root.rules).flatMap((r) => validateRule(r, dropped)),
      workflows: arrayOf(root.workflows).flatMap((w) => validateWorkflow(w, dropped)),
      requirements: arrayOf(root.requirements).flatMap((q) => validateRequirement(q, dropped)),
      decisions: arrayOf(root.decisions).flatMap((d) => validateDecision(d, dropped)),
      risks: arrayOf(root.risks).flatMap((k) => validateRisk(k, dropped)),
    },
    dropped,
  };
}

function validateEntity(raw: unknown, dropped: Drop[]): ExtractedEntity[] {
  if (!isObject(raw)) return drop(dropped, "entity", "مش كائن");
  const name = str(raw.name);
  if (!name) return drop(dropped, "entity", "بلا اسم");

  const entityType = coerceEnum(raw.entity_type ?? raw.entityType, ENTITY_TYPES, "unknown");
  return [
    {
      entityType,
      name,
      normalizedKey: normalizeEntityKey(name),
      description: str(raw.description),
      confidence: clampConfidence(raw.confidence),
      quote: str(raw.quote),
    },
  ];
}

function validateRelation(
  raw: unknown,
  knownEntities: Set<string>,
  dropped: Drop[]
): ExtractedRelation[] {
  if (!isObject(raw)) return drop(dropped, "relation", "مش كائن");
  const fromName = str(raw.from ?? raw.from_name ?? raw.fromName);
  const toName = str(raw.to ?? raw.to_name ?? raw.toName);
  const relationType = str(raw.relation_type ?? raw.relationType ?? raw.type);

  if (!fromName || !toName || !relationType) {
    return drop(dropped, "relation", "طرف أو نوع ناقص");
  }
  if (fromName === toName) return drop(dropped, "relation", "علاقة كيان بنفسه");

  // الطرفان لازم يكونوا كيانات مستخرَجة فعلًا.
  if (!knownEntities.has(normalizeEntityKey(fromName)) || !knownEntities.has(normalizeEntityKey(toName))) {
    return drop(dropped, "relation", "طرف غير مستخرَج ككيان");
  }

  return [{ fromName, toName, relationType, confidence: clampConfidence(raw.confidence) }];
}

function validateRule(raw: unknown, dropped: Drop[]): ExtractedRule[] {
  if (!isObject(raw)) return drop(dropped, "rule", "مش كائن");
  const condition = str(raw.condition);
  const action = str(raw.action);
  // قاعدة عمل بلا شرط أو نتيجة مش قاعدة — دي جملة.
  if (!condition || !action) return drop(dropped, "rule", "شرط أو نتيجة ناقص");

  return [
    {
      name: str(raw.name) || truncate(condition),
      condition,
      action,
      ruleType: coerceEnum(raw.rule_type ?? raw.ruleType, RULE_TYPES, "validation"),
      scope: strOrNull(raw.scope),
      priority: coercePriority(raw.priority),
      confidence: clampConfidence(raw.confidence),
      quote: str(raw.quote),
    },
  ];
}

function validateWorkflow(raw: unknown, dropped: Drop[]): ExtractedWorkflow[] {
  if (!isObject(raw)) return drop(dropped, "workflow", "مش كائن");
  const name = str(raw.name);
  const stepsRaw = arrayOf(raw.steps);
  // سير عمل بأقل من خطوتين مش سير عمل — دي مهمة واحدة.
  if (!name || stepsRaw.length < 2) return drop(dropped, "workflow", "بلا اسم أو أقل من خطوتين");

  const steps = stepsRaw
    .map((s) => {
      if (!isObject(s)) return null;
      const stepName = str(s.name ?? s.step);
      if (!stepName) return null;
      return {
        name: stepName,
        actor: strOrNull(s.actor),
        condition: strOrNull(s.condition),
        isApproval: Boolean(s.is_approval ?? s.isApproval) || /اعتماد|موافقة|approval/i.test(stepName),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (steps.length < 2) return drop(dropped, "workflow", "خطوات صالحة أقل من اثنتين");

  return [
    {
      name,
      description: str(raw.description),
      trigger: strOrNull(raw.trigger),
      outcome: strOrNull(raw.outcome),
      domain: strOrNull(raw.domain),
      steps,
      confidence: clampConfidence(raw.confidence),
    },
  ];
}

function validateRequirement(raw: unknown, dropped: Drop[]): ExtractedRequirement[] {
  if (!isObject(raw)) return drop(dropped, "requirement", "مش كائن");
  const statement = str(raw.statement ?? raw.text);
  if (!statement) return drop(dropped, "requirement", "بلا نصّ");

  return [
    {
      requirementType: coerceEnum(
        raw.requirement_type ?? raw.requirementType ?? raw.type,
        REQUIREMENT_TYPES,
        "functional"
      ),
      statement,
      rationale: strOrNull(raw.rationale),
      priority: coerceReqPriority(raw.priority),
      module: strOrNull(raw.module),
      confidence: clampConfidence(raw.confidence),
      quote: str(raw.quote),
    },
  ];
}

function validateDecision(raw: unknown, dropped: Drop[]): ExtractedDecision[] {
  if (!isObject(raw)) return drop(dropped, "decision", "مش كائن");
  const decision = str(raw.decision ?? raw.text);
  if (!decision) return drop(dropped, "decision", "بلا نصّ");

  return [
    {
      decision,
      rationale: strOrNull(raw.rationale ?? raw.reason),
      decisionMaker: strOrNull(raw.decision_maker ?? raw.decisionMaker ?? raw.maker),
      decidedOn: strOrNull(raw.decided_on ?? raw.decidedOn ?? raw.date),
      impact: strOrNull(raw.impact),
      affectedModules: arrayOf(raw.affected_modules ?? raw.affectedModules)
        .map((m) => str(m))
        .filter(Boolean),
      confidence: clampConfidence(raw.confidence),
      quote: str(raw.quote),
    },
  ];
}

function validateRisk(raw: unknown, dropped: Drop[]): ExtractedRisk[] {
  if (!isObject(raw)) return drop(dropped, "risk", "مش كائن");
  const description = str(raw.description ?? raw.text);
  if (!description) return drop(dropped, "risk", "بلا وصف");

  return [
    {
      riskType: coerceEnum(raw.risk_type ?? raw.riskType ?? raw.type, RISK_TYPES, "operational"),
      description,
      likelihood: coerceLikelihood(raw.likelihood),
      severity: coerceSeverity(raw.severity),
      mitigation: strOrNull(raw.mitigation),
      affectedArea: strOrNull(raw.affected_area ?? raw.affectedArea),
      confidence: clampConfidence(raw.confidence),
      quote: str(raw.quote),
    },
  ];
}

// ============================================================
// أدوات
// ============================================================

type Drop = { kind: string; reason: string };

function drop(dropped: Drop[], kind: string, reason: string): [] {
  dropped.push({ kind, reason });
  return [];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arrayOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s || null;
}

/** يحوّل قيمة لأقرب عضو في قائمة معروفة، أو الافتراضي. */
function coerceEnum<T extends readonly string[]>(
  v: unknown,
  allowed: T,
  fallback: T[number]
): T[number] {
  const s = str(v).toLowerCase().replace(/\s+/g, "_");
  return (allowed as readonly string[]).includes(s) ? (s as T[number]) : fallback;
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 60;
  // القيم اللي بين ٠ و١ تتحوّل لنسبة مئوية — بعض النماذج بترجّعها كده.
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function coercePriority(v: unknown): "critical" | "high" | "medium" | "low" {
  const s = str(v).toLowerCase();
  if (s === "critical" || s === "حرج") return "critical";
  if (s === "high" || s === "عالي" || s === "عالية") return "high";
  if (s === "low" || s === "منخفض" || s === "منخفضة") return "low";
  return "medium";
}

function coerceReqPriority(v: unknown): "must" | "should" | "could" | "wont" | "medium" {
  const s = str(v).toLowerCase();
  if (["must", "should", "could", "wont"].includes(s)) return s as "must";
  return "medium";
}

function coerceLikelihood(v: unknown): Likelihood {
  const s = str(v).toLowerCase();
  if (s === "high" || s === "عالي" || s === "عالية") return "high";
  if (s === "low" || s === "منخفض" || s === "منخفضة") return "low";
  return "medium";
}

function coerceSeverity(v: unknown): Severity {
  const s = str(v).toLowerCase();
  if (s === "critical" || s === "حرج") return "critical";
  if (s === "high" || s === "عالي" || s === "عالية") return "high";
  if (s === "low" || s === "منخفض" || s === "منخفضة") return "low";
  return "medium";
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
