import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildMigrationRecoveryPrompt } from "@/lib/ai/prompts/migration-recovery";
import { validateMigrationRecovery, type RecoverySuggestion } from "@/lib/ai/validation/migration-recovery";
import { decideRecovery } from "./recovery";
import { redactSecrets, buildAuditEvent } from "./audit";

/**
 * الاستعادة بالذكاء الاصطناعي (AI Recovery Engine) — لمهمة في طابور المراجعة.
 * يبدأ بالقرار الحتمي، وإن كان الخطأ غير معروف يطلب اقتراحًا من AI (مستندًا،
 * بأسرار منقّاة). **لا يُطبَّق تلقائيًا** — يُعرَض للمدير ليقرّر (retry/skip).
 */

export interface RecoverySuggestionResult {
  ok: boolean;
  suggestion?: RecoverySuggestion;
  message?: string;
}

export async function suggestRecovery(taskId: string, actorId: string | null, client?: SupabaseClient): Promise<RecoverySuggestionResult> {
  const db = client ?? createServiceClient();
  const task = await db.from("migration_execution_tasks").select("execution_id, entity, last_error, retry_count").eq("id", taskId).maybeSingle();
  const t = task.data as { execution_id: string; entity: string; last_error: string | null; retry_count: number } | null;
  if (!t) return { ok: false, message: "المهمة غير موجودة." };

  const message = t.last_error ?? "خطأ غير محدّد";
  const deterministic = decideRecovery(message, t.retry_count, 3);
  // معروف → القرار الحتمي كافٍ.
  if (deterministic.errorClass !== "unknown") {
    return { ok: true, suggestion: { error_class: deterministic.errorClass, action: deterministic.action, auto_safe: deterministic.autoSafe, suggestion: deterministic.reason, reason: "قرار حتمي." } };
  }

  try {
    const prompt = buildMigrationRecoveryPrompt(t.entity, message, "ترحيل حقيقي على دفعات؛ الأخطاء تُعالَج محليًا دون إيقاف العملية.");
    const resp = await AIService.execute(AITaskType.MIGRATION_RECOVERY, prompt, { actorId: actorId ?? undefined });
    if (!resp.success) return { ok: true, suggestion: { error_class: "unknown", action: "review", auto_safe: false, suggestion: "تعذّر توليد اقتراح — مراجعة يدوية.", reason: "" } };
    const v = validateMigrationRecovery(resp.output);
    if (!v.ok) return { ok: true, suggestion: { error_class: "unknown", action: "review", auto_safe: false, suggestion: "اقتراح غير صالح — مراجعة يدوية.", reason: "" } };
    return { ok: true, suggestion: v.data };
  } catch {
    return { ok: true, suggestion: { error_class: "unknown", action: "review", auto_safe: false, suggestion: "خطأ أثناء الاقتراح — مراجعة يدوية.", reason: "" } };
  }
}

/** يطبّق قرار المدير على مهمة مراجعة (retry/skip) — بعد موافقته صراحةً. */
export async function applyRecovery(taskId: string, action: "retry" | "skip", actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const task = await db.from("migration_execution_tasks").select("execution_id, status").eq("id", taskId).maybeSingle();
  const t = task.data as { execution_id: string; status: string } | null;
  if (!t) return { ok: false, message: "المهمة غير موجودة." };
  if (t.status !== "review" && t.status !== "failed") return { ok: false, message: "المهمة ليست في طابور المراجعة." };

  const next = action === "retry" ? "pending" : "skipped";
  await db.from("migration_execution_tasks").update({ status: next }).eq("id", taskId);
  await db.from("migration_execution_events").insert({
    execution_id: t.execution_id, event_type: "recovery_applied", actor_id: actorId,
    detail: redactSecrets(buildAuditEvent("recovery_applied", actorId, { taskId, action }).detail) as Record<string, unknown>,
  });
  return { ok: true, message: action === "retry" ? "أُعيدت المهمة للطابور — استأنف التنفيذ." : "تُخُطّيت المهمة بموافقة المدير." };
}
