/**
 * أنواع طبقة الطوابير — المفردات الوحيدة للنظام كله.
 *
 * الوحدة دي نقية تمامًا: مفيش أي I/O ولا استيراد من Supabase. كل
 * منطق القرار (الانتقالات، إعادة المحاولة، الأولويات) مبني فوقها،
 * فيتغطّى بالاختبار من غير قاعدة بيانات ولا شبكة.
 */

/**
 * حالات المهمة الإحدى عشرة.
 *
 * فرقان يستحقان الشرح لأنهما يبدوان تكرارًا وهما ليسا كذلك:
 *
 * `waiting` مقابل `queued` — `queued` معناها **جاهزة الآن** والعامل
 * يقدر يسحبها فورًا. `waiting` معناها **محجوبة بشرط خارجي**: قفل
 * مورد محجوز، أو موعد مجدول لسه ماجاش. الخلط بينهما بيخفي سبب
 * التأخير، فالمشغّل يشوف طابورًا طويلًا ولا يعرف إن نصفه مش جاهز أصلًا.
 *
 * `timeout` مقابل `failed` — الأولى معناها **مامخلّصتش في وقتها**،
 * والتانية معناها **رمت خطأ**. المقياسان مختلفان والعلاج مختلف:
 * المهلة بتقول إن الميزانية الزمنية صغيرة أو المهمة أتقل من المتوقّع،
 * والخطأ بيقول إن فيه عطل حقيقي.
 */
export type JobStatus =
  | "pending"
  | "queued"
  | "waiting"
  | "running"
  | "retrying"
  | "paused"
  | "canceled"
  | "completed"
  | "failed"
  | "dead_letter"
  | "timeout";

/** الأولويات الخمس — مرتّبة من الأعلى للأدنى. */
export type JobPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * تصنيف الفشل — بيحدّد هل نعيد المحاولة أصلًا.
 *
 * إعادة محاولة خطأ دائم عشر مرات هدر خالص، وده اللي بتعمله معظم
 * النظم الساذجة. التصنيف هنا إلزامي مش تحسين.
 */
export type JobFailureClass = "transient" | "permanent" | "unknown";

export type WorkerStatus = "starting" | "idle" | "busy" | "draining" | "stopped" | "unhealthy";

export type JobLogLevel = "execution" | "warning" | "error" | "performance";

/** الحالات النهائية — لا انتقال بعدها إطلاقًا. */
export const TERMINAL_STATUSES: readonly JobStatus[] = [
  "completed",
  "failed",
  "canceled",
  "dead_letter",
] as const;

/** الحالات التي تُعتبر المهمة فيها "حيّة" — تشغل مكانًا في الطابور. */
export const ACTIVE_STATUSES: readonly JobStatus[] = [
  "pending",
  "queued",
  "waiting",
  "running",
  "retrying",
  "paused",
] as const;

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isActiveStatus(status: JobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * صفّ المهمة كما هو في قاعدة البيانات.
 *
 * الأسماء مطابقة لأعمدة الجدول حرفيًا — أي اختلاف في التسمية بين
 * الطبقتين بيولّد أخطاء صامتة عند القراءة.
 */
export interface JobRow {
  id: string;
  type: string;
  status: JobStatus;
  priority: JobPriority;

  project_id: string | null;
  created_by: string | null;

  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;

  /** رقم للعرض فقط — **ممنوع** الاستئناف بناءً عليه. */
  progress: number;
  progress_message: string | null;
  /** موضع التوقّف الفعلي — هو أساس الاستئناف. */
  checkpoint: Record<string, unknown> | null;

  attempts: number;
  max_attempts: number;

  worker_id: string | null;
  lock_key: string | null;

  idempotency_key: string | null;
  dedupe_hash: string | null;
  trace_id: string | null;

  error_message: string | null;
  error_stack: string | null;
  error_class: JobFailureClass | null;

  execution_time_ms: number | null;
  queue_time_ms: number | null;
  cpu_usage_ms: number | null;
  memory_peak_mb: number | null;
  estimated_cost_usd: number | null;

  metadata: Record<string, unknown>;

  created_at: string;
  available_at: string;
  scheduled_for: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  finished_at: string | null;
  canceled_at: string | null;
  retry_at: string | null;
}

/** مدخل إنشاء مهمة جديدة. */
export interface EnqueueInput {
  type: string;
  payload?: Record<string, unknown>;
  priority?: JobPriority;
  projectId?: string | null;
  createdBy?: string | null;
  maxAttempts?: number;
  /** تأجيل متعمَّد — المهمة تدخل `waiting` حتى هذا الموعد. */
  scheduledFor?: Date | null;
  /** قفل المورد المطلوب قبل التنفيذ. */
  lockKey?: string | null;
  idempotencyKey?: string | null;
  /** بصمة إسقاط التكرار — تُحسب من المدخل. */
  dedupeHash?: string | null;
  traceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * السياق المُمرَّر لمعالج المهمة.
 *
 * ده العقد الوحيد بين إطار الطوابير وأي عامل مستقبلي. توسيعه ممكن،
 * وتغييره بيكسر كل المعالجات — فيُعامَل كواجهة عامة مستقرة.
 */
export interface JobContext<TPayload = Record<string, unknown>> {
  jobId: string;
  type: string;
  payload: TPayload;
  attempt: number;
  projectId: string | null;
  traceId: string | null;

  /** آخر نقطة توقّف محفوظة — `null` في التشغيل الأول. */
  checkpoint: Record<string, unknown> | null;

  /** تحديث نسبة التقدّم (٠-١٠٠) مع رسالة اختيارية للمستخدم. */
  reportProgress(percent: number, message?: string): Promise<void>;

  /**
   * حفظ موضع التوقّف. المهمة اللي بتستأنف بتبدأ من هنا.
   * يُستدعى بعد كل وحدة عمل مكتملة، لا بعد كل عملية صغيرة.
   */
  saveCheckpoint(checkpoint: Record<string, unknown>): Promise<void>;

  log(level: JobLogLevel, message: string, context?: Record<string, unknown>): Promise<void>;

  /**
   * هل طُلب الإلغاء؟
   *
   * يُفحص **بين الخطوات لا أثناءها**. الإلغاء وسط نداء مدفوع الثمن
   * (نموذج ذكاء اصطناعي مثلًا) بيرمي عملًا اتدفع فيه فعلًا.
   */
  isCanceled(): Promise<boolean>;

  /** إشارة إلغاء قياسية — تُمرَّر لأي نداء يدعم `AbortSignal`. */
  signal: AbortSignal;
}

/** نتيجة تنفيذ المعالج. */
export type JobResult = {
  result?: Record<string, unknown>;
  costUsd?: number;
} | void;

/** توقيع المعالج — الدالة الوحيدة اللي بيكتبها مطوّر العامل الجديد. */
export type JobHandler<TPayload = Record<string, unknown>> = (
  ctx: JobContext<TPayload>
) => Promise<JobResult>;
