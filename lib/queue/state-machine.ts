import type { JobStatus } from "./types";

/**
 * آلة حالة المهمة — وحدة نقية.
 *
 * كل انتقال في النظام يمرّ من هنا. الانتقال غير المُدرَج **خطأ برمجي
 * يُرفَض**، لا حالة يُتسامَح معها: الحالة الفاسدة في نظام طوابير معناها
 * مهمة تعمل مرتين أو مهمة لا تعمل أبدًا، والاثنان صامتان.
 */

/**
 * خريطة الانتقالات المسموحة.
 *
 * الحالات النهائية لها مصفوفة فارغة عن قصد — ما يخلص يخلص. مهمة
 * `completed` تعود `running` معناها نتيجة تُكتب مرتين.
 */
export const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  // أُنشئت ولم تُدرَج بعد
  pending: ["queued", "waiting", "canceled"],

  // جاهزة الآن — العامل يقدر يسحبها
  queued: ["running", "waiting", "paused", "canceled"],

  // محجوبة بشرط خارجي (قفل محجوز أو موعد لم يحن)
  waiting: ["queued", "canceled", "failed"],

  // قيد التنفيذ
  running: ["completed", "retrying", "failed", "timeout", "paused", "canceled"],

  // فشلت فشلًا عابرًا وتنتظر التراجع الأُسّي
  retrying: ["queued", "failed", "dead_letter", "canceled"],

  // أوقفها المستخدم مؤقتًا
  paused: ["queued", "canceled"],

  // انتهت مهلتها — تُعامَل كفشل عابر قابل لإعادة المحاولة
  timeout: ["retrying", "failed", "dead_letter", "canceled"],

  // فشلت نهائيًا. الأرشفة للمراجعة هي الحركة الوحيدة المتبقّية، وهي
  // حركة إدارية لا تنفيذية — المهمة **لن تشتغل تاني** من أي منهما.
  failed: ["dead_letter"],

  // نهائية
  completed: [],
  canceled: [],
  dead_letter: [],
};

/** هل الانتقال مسموح؟ */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false; // الانتقال لنفس الحالة ليس انتقالًا
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus
  ) {
    super(`انتقال غير مسموح: ${from} ← ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** يرمي عند الانتقال غير المسموح — الاستخدام الافتراضي في الخدمة. */
export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** كل الحالات التي يمكن الوصول إليها من حالة معيّنة في خطوة واحدة. */
export function nextStatuses(from: JobStatus): readonly JobStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/**
 * هل يمكن إلغاء المهمة الآن؟
 *
 * **مشتقّة من خريطة الانتقالات لا محسوبة بشكل مستقل.** الحساب المستقل
 * سمح بتباعد حقيقي: الدالة كانت تقول «نعم» لحالة ترفضها الخريطة، فكان
 * الإلغاء يكتب حالة غير مسموحة بلا اعتراض.
 *
 * والمهمة المنتهية لا تُلغى: زر إلغاء يعمل على مهمة مكتملة يعطي
 * المستخدم انطباعًا كاذبًا بأن شيئًا تراجع، وهو لم يتراجع.
 */
export function canCancel(status: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[status].includes("canceled");
}

/** هل يمكن إيقافها مؤقتًا؟ */
export function canPause(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

/** هل يمكن استئنافها؟ */
export function canResume(status: JobStatus): boolean {
  return status === "paused";
}

/**
 * هل يمكن نقلها إلى الرسائل الميتة؟
 *
 * `retrying` مدرجة لأن استنفاد المحاولات يحدث لحظة تقييم إعادة
 * المحاولة، فتنتقل مباشرة دون المرور بـ `failed`.
 */
export function canDeadLetter(status: JobStatus): boolean {
  return status === "failed" || status === "retrying" || status === "timeout";
}
