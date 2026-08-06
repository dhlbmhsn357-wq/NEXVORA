import type { SupportAiDiagnosis, SupportPriority, SupportRequestType, SupportStructuredSummary } from "@/lib/types/database";

const EXPECTED_KEYS = [
  "reply_to_customer",
  "classification",
  "ready_to_resolve_directly",
  "ready_to_escalate",
  "structured_summary",
  "related_prd_section",
  "related_brain_fact",
  "ai_diagnosis",
] as const;

const VALID_CLASSIFICATIONS: SupportRequestType[] = [
  "usage_question",
  "usage_problem",
  "bug",
  "feature_request",
  "change_request",
  "unclear",
];

const VALID_PRIORITIES: SupportPriority[] = ["low", "medium", "high", "critical"];

const DIRECT_RESOLVABLE_CLASSIFICATIONS: SupportRequestType[] = ["usage_question", "usage_problem"];

export interface SupportTriageGeneratedData {
  replyToCustomer: string;
  classification: SupportRequestType | null;
  readyToResolveDirectly: boolean;
  readyToEscalate: boolean;
  structuredSummary: SupportStructuredSummary | null;
  relatedPrdSection: string | null;
  relatedBrainFact: string | null;
  aiDiagnosis: SupportAiDiagnosis | null;
}

export type SupportTriageValidationResult =
  | { ok: true; data: SupportTriageGeneratedData }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * يتحقق من رد محرك Support Triage قبل أي استخدام: JSON صالح، 7 مفاتيح
 * بالضبط، وأهم من كده — يفرض قاعدة "منع الوعود والحلول غير المؤكدة"
 * برمجيًا: ready_to_resolve_directly مسموح بس لو التصنيف
 * usage_question أو usage_problem، وready_to_escalate يتطلب
 * structured_summary كامل.
 */
export function validateSupportTriage(raw: string | null): SupportTriageValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const obj = parsed as Record<string, unknown>;
  const actualKeys = Object.keys(obj);

  const missingKeys = EXPECTED_KEYS.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `مفاتيح ناقصة: ${missingKeys.join(", ")}` };
  }

  const extraKeys = actualKeys.filter((k) => !(EXPECTED_KEYS as readonly string[]).includes(k));
  if (extraKeys.length > 0) {
    return { ok: false, reason: `مفاتيح إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }

  if (!isNonEmptyString(obj.reply_to_customer)) {
    return { ok: false, reason: "reply_to_customer غير صالح أو فارغ." };
  }

  if (obj.classification !== null && !VALID_CLASSIFICATIONS.includes(obj.classification as SupportRequestType)) {
    return { ok: false, reason: `classification غير صالحة: ${String(obj.classification)}` };
  }
  const classification = obj.classification as SupportRequestType | null;

  if (typeof obj.ready_to_resolve_directly !== "boolean") {
    return { ok: false, reason: "ready_to_resolve_directly يجب أن تكون boolean." };
  }
  if (typeof obj.ready_to_escalate !== "boolean") {
    return { ok: false, reason: "ready_to_escalate يجب أن تكون boolean." };
  }
  if (obj.ready_to_resolve_directly && obj.ready_to_escalate) {
    return { ok: false, reason: "لا يمكن أن يكون ready_to_resolve_directly وready_to_escalate صح في نفس الوقت." };
  }
  if ((obj.ready_to_resolve_directly || obj.ready_to_escalate) && classification === null) {
    return { ok: false, reason: "لازم classification محدد قبل الحل المباشر أو التصعيد." };
  }
  if (obj.ready_to_resolve_directly && classification && !DIRECT_RESOLVABLE_CLASSIFICATIONS.includes(classification)) {
    return {
      ok: false,
      reason: `ready_to_resolve_directly غير مسموح لتصنيف "${classification}" — لازم يتصعّد بدل الحل المباشر.`,
    };
  }

  let structuredSummary: SupportStructuredSummary | null = null;
  if (obj.ready_to_escalate) {
    if (typeof obj.structured_summary !== "object" || obj.structured_summary === null) {
      return { ok: false, reason: "structured_summary إلزامي عند التصعيد." };
    }
    const s = obj.structured_summary as Record<string, unknown>;
    if (!isNonEmptyString(s.problem_description)) {
      return { ok: false, reason: "structured_summary.problem_description غير صالح أو فارغ." };
    }
    if (!isNullableString(s.started_when) || !isNullableString(s.reproduction_steps) || !isNullableString(s.current_result) || !isNullableString(s.expected_result)) {
      return { ok: false, reason: "أحد حقول structured_summary غير صالح (لازم نص أو null)." };
    }
    if (typeof s.priority !== "string" || !VALID_PRIORITIES.includes(s.priority as SupportPriority)) {
      return { ok: false, reason: `structured_summary.priority غير صالحة: ${String(s.priority)}` };
    }
    structuredSummary = {
      problem_description: s.problem_description as string,
      started_when: (s.started_when as string | null) ?? null,
      reproduction_steps: (s.reproduction_steps as string | null) ?? null,
      current_result: (s.current_result as string | null) ?? null,
      expected_result: (s.expected_result as string | null) ?? null,
      priority: s.priority as SupportPriority,
      attachments: [],
    };
  } else if (obj.structured_summary !== null) {
    return { ok: false, reason: "structured_summary لازم يكون null لو مفيش تصعيد." };
  }

  if (!isNullableString(obj.related_prd_section) || !isNullableString(obj.related_brain_fact)) {
    return { ok: false, reason: "related_prd_section/related_brain_fact لازم تكون نص أو null." };
  }

  let aiDiagnosis: SupportAiDiagnosis | null = null;
  if (obj.ready_to_escalate) {
    if (typeof obj.ai_diagnosis !== "object" || obj.ai_diagnosis === null) {
      return { ok: false, reason: "ai_diagnosis إلزامي عند التصعيد." };
    }
    const d = obj.ai_diagnosis as Record<string, unknown>;
    if (!isNonEmptyString(d.probable_cause) || !isNonEmptyString(d.suggested_fix)) {
      return { ok: false, reason: "ai_diagnosis.probable_cause/suggested_fix غير صالح أو فارغ." };
    }
    const confidence = Number(d.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      return { ok: false, reason: "ai_diagnosis.confidence غير صالح." };
    }
    aiDiagnosis = { probable_cause: d.probable_cause, suggested_fix: d.suggested_fix, confidence: Math.round(confidence) };
  } else if (obj.ai_diagnosis !== null) {
    return { ok: false, reason: "ai_diagnosis لازم يكون null لو مفيش تصعيد." };
  }

  return {
    ok: true,
    data: {
      replyToCustomer: obj.reply_to_customer as string,
      classification,
      readyToResolveDirectly: obj.ready_to_resolve_directly as boolean,
      readyToEscalate: obj.ready_to_escalate as boolean,
      structuredSummary,
      relatedPrdSection: (obj.related_prd_section as string | null) ?? null,
      relatedBrainFact: (obj.related_brain_fact as string | null) ?? null,
      aiDiagnosis,
    },
  };
}
