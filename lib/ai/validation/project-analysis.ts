import type { ProjectAnalysis } from "@/lib/types/database";

const EXPECTED_KEYS = [
  "root_problem",
  "target_users",
  "opportunities",
  "risks",
  "meeting_questions",
] as const;

export type ProjectAnalysisValidationResult =
  | { ok: true; data: ProjectAnalysis }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

/**
 * يتحقق من رد الـ AI الخام (نص) قبل حفظه: JSON صالح، المفاتيح بالضبط
 * (لا نقص ولا زيادة)، الأنواع صحيحة، والقيم غير فارغة بشكل غير منطقي.
 * لا يُحفظ أي شيء في قاعدة البيانات لو الفحص فشل.
 */
export function validateProjectAnalysis(raw: string | null): ProjectAnalysisValidationResult {
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

  if (!isNonEmptyString(obj.root_problem)) {
    return { ok: false, reason: "root_problem غير صالح أو فارغ." };
  }
  if (!isStringArray(obj.target_users)) {
    return { ok: false, reason: "target_users يجب أن تكون قائمة نصوص غير فارغة." };
  }
  if (!isStringArray(obj.opportunities)) {
    return { ok: false, reason: "opportunities يجب أن تكون قائمة نصوص غير فارغة." };
  }
  if (!isStringArray(obj.risks)) {
    return { ok: false, reason: "risks يجب أن تكون قائمة نصوص غير فارغة." };
  }
  if (!isStringArray(obj.meeting_questions) || obj.meeting_questions.length === 0) {
    return { ok: false, reason: "meeting_questions يجب أن تحتوي على سؤال واحد على الأقل." };
  }

  return {
    ok: true,
    data: {
      root_problem: obj.root_problem,
      target_users: obj.target_users,
      opportunities: obj.opportunities,
      risks: obj.risks,
      meeting_questions: obj.meeting_questions,
    },
  };
}
