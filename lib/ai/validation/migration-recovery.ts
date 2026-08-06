/**
 * مُتحقّق مخرَج استعادة أخطاء الترحيل — نمط صارم. لا يلغي القرار الحتمي؛
 * يقترح للأخطاء غير المعروفة فقط. المدير هو من يعتمد التطبيق.
 */

export interface RecoverySuggestion {
  error_class: "transient" | "constraint" | "resource" | "data" | "unknown";
  action: "retry" | "skip" | "review" | "abort";
  auto_safe: boolean;
  suggestion: string;
  reason: string;
}

export type RecoveryValidation = { ok: true; data: RecoverySuggestion } | { ok: false; reason: string };

const CLASSES = new Set(["transient", "constraint", "resource", "data", "unknown"]);
const ACTIONS = new Set(["retry", "skip", "review", "abort"]);

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}

export function validateMigrationRecovery(raw: string | null): RecoveryValidation {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "مخرَج فارغ." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "JSON غير صالح." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "المخرَج ليس كائنًا." };
  const o = parsed as Record<string, unknown>;

  const action = typeof o.action === "string" && ACTIONS.has(o.action) ? (o.action as RecoverySuggestion["action"]) : "review";
  return {
    ok: true,
    data: {
      error_class: typeof o.error_class === "string" && CLASSES.has(o.error_class) ? (o.error_class as RecoverySuggestion["error_class"]) : "unknown",
      action,
      // احترازيًا: لا نسمح بـauto_safe إلا لو النموذج أكّده صراحةً ولم يكن abort/skip.
      auto_safe: o.auto_safe === true && (action === "retry"),
      suggestion: typeof o.suggestion === "string" ? o.suggestion.trim() : "",
      reason: typeof o.reason === "string" ? o.reason.trim() : "",
    },
  };
}
