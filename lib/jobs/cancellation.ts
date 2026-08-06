import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cancellation / Supersede primitives — آلية عامة قابلة لإعادة الاستخدام
 * لأي مرحلة طويلة تعتمد على الـ AI أو Background Jobs. الفكرة: كل تنفيذ
 * له execution_id، وأي Callback متأخر لازم يتأكد قبل ما يكتب إن التنفيذ
 * اللي بدأ تحته لسه هو النشط — وإلا يُتجاهل بهدوء (لا يكتب فوق تنفيذ أحدث).
 *
 * تُستخدم حاليًا في Engineering QA (Cancelable Reviews)، ومصمَّمة عشان
 * تتبنّاها باقي المراحل (Discovery/Meeting/Brain/PRD/Prototype/...)
 * بخطوات قليلة: أضف execution_id + الأعمدة في الجدول، ثم استدعِ
 * shouldDiscardCallback قبل أي كتابة، و supersedeActiveRow عند بدء تنفيذ جديد.
 */

/** الحالات اللي تعتبر "قيد التشغيل" افتراضيًا — تنفيذ حي يقدر يكمل. */
export const DEFAULT_RUNNABLE_STATUSES = ["queued", "running"] as const;

export interface RunnableRowSnapshot {
  status: string;
  execution_id: string;
}

/** هل الحالة تسمح بالاستمرار (تنفيذ حي)؟ */
export function isRunnableStatus(status: string, runnable: readonly string[] = DEFAULT_RUNNABLE_STATUSES): boolean {
  return runnable.includes(status);
}

/**
 * حارس الـ Callback — يُستدعى قبل أي كتابة نتائج/تقدّم. يرجّع true (تجاهل)
 * لو: الصف اختفى، أو حالته مش قابلة للتشغيل (اتلغى/اكتمل/فشل)، أو
 * execution_id اتغيّر (تنفيذ أحدث حجز مكانه). بكده أي نتيجة AI متأخرة من
 * تنفيذ قديم لا تكتب أبدًا فوق تنفيذ جديد.
 */
export function shouldDiscardCallback(
  current: RunnableRowSnapshot | null,
  startedExecutionId: string,
  runnable: readonly string[] = DEFAULT_RUNNABLE_STATUSES
): boolean {
  if (!current) return true;
  if (!isRunnableStatus(current.status, runnable)) return true;
  if (current.execution_id !== startedExecutionId) return true;
  return false;
}

export interface SupersedeResult {
  supersededId: string | null;
}

/**
 * يلغي الصف النشط (لو وجد) لمشروع معيّن في جدول ما، بنقلة آمنة عبر
 * cancelling → cancelled، ويرجّع معرّفه. لا يلمس الصفوف التابعة (مراحل/
 * نتائج) — دي مسؤولية المحرك المستدعي لأنها خاصة به. race-safe: الـ WHERE
 * على مجموعة الحالات النشطة يضمن إن تنفيذ واحد بس ينجح في المطالبة.
 */
export async function supersedeActiveRow(
  supabase: SupabaseClient,
  params: {
    table: string;
    projectColumn: string;
    projectId: string;
    activeStatuses: string[];
    statusColumn?: string;
    cancellingStatus?: string;
    cancelledStatus?: string;
    cancelFields?: Record<string, unknown>;
  }
): Promise<SupersedeResult> {
  const statusColumn = params.statusColumn ?? "review_status";
  const cancelling = params.cancellingStatus ?? "cancelling";
  const cancelled = params.cancelledStatus ?? "cancelled";

  const { data: active } = await supabase
    .from(params.table)
    .select("id")
    .eq(params.projectColumn, params.projectId)
    .in(statusColumn, params.activeStatuses)
    .maybeSingle();

  if (!active) return { supersededId: null };
  const activeId = active.id as string;

  // نقلة انتقالية تحرّر أي Partial Unique Index على الحالات النشطة فورًا
  await supabase.from(params.table).update({ [statusColumn]: cancelling }).eq("id", activeId);
  await supabase
    .from(params.table)
    .update({ [statusColumn]: cancelled, ...(params.cancelFields ?? {}) })
    .eq("id", activeId);

  return { supersededId: activeId };
}
