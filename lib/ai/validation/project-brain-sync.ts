import type { DecisionLogItem, OpenQuestionItem } from "@/lib/types/database";

const EXPECTED_KEYS = [
  "summary",
  "key_facts",
  "pain_points",
  "decisions_log",
  "open_questions",
] as const;

export interface ProjectBrainSyncData {
  summary: string;
  key_facts: string[];
  pain_points: string[];
  decisions_log: DecisionLogItem[];
  open_questions: OpenQuestionItem[];
}

export type ProjectBrainSyncValidationResult =
  | { ok: true; data: ProjectBrainSyncData }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

function isDecisionLogArray(value: unknown): value is DecisionLogItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        isNonEmptyString((v as Record<string, unknown>).content) &&
        isNonEmptyString((v as Record<string, unknown>).source)
    )
  );
}

function isOpenQuestionArray(value: unknown): value is OpenQuestionItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        isNonEmptyString((v as Record<string, unknown>).question) &&
        typeof (v as Record<string, unknown>).answered === "boolean"
    )
  );
}

/**
 * يتحقق من رد الـ AI الخام قبل أي تحديث لـ Project Brain: JSON صالح،
 * المفاتيح بالضبط، وشكل كل عنصر صحيح (decisions_log/open_questions
 * كـ Objects بحقولها المطلوبة).
 */
export function validateProjectBrainSync(raw: string | null): ProjectBrainSyncValidationResult {
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

  if (!isNonEmptyString(obj.summary)) {
    return { ok: false, reason: "summary غير صالح أو فارغ." };
  }
  if (!isStringArray(obj.key_facts)) {
    return { ok: false, reason: "key_facts يجب أن تكون مصفوفة نصوص غير فارغة القيم." };
  }
  if (!isStringArray(obj.pain_points)) {
    return { ok: false, reason: "pain_points يجب أن تكون مصفوفة نصوص غير فارغة القيم." };
  }
  if (!isDecisionLogArray(obj.decisions_log)) {
    return { ok: false, reason: "decisions_log يجب أن تكون مصفوفة { content, source } صالحة." };
  }
  if (!isOpenQuestionArray(obj.open_questions)) {
    return { ok: false, reason: "open_questions يجب أن تكون مصفوفة { question, answered } صالحة." };
  }

  return {
    ok: true,
    data: {
      summary: obj.summary,
      key_facts: obj.key_facts as string[],
      pain_points: obj.pain_points as string[],
      decisions_log: obj.decisions_log as DecisionLogItem[],
      open_questions: obj.open_questions as OpenQuestionItem[],
    },
  };
}
