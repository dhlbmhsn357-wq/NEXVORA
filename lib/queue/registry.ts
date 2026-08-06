import type { UserRole } from "@/lib/types/database";
import type { JobHandler, JobPriority } from "./types";

/**
 * سجل معالجات المهام — قلب البنية القابلة للتوسيع (Plugin-Based).
 *
 * **الهدف المعماري:** إضافة عامل جديد لاحقًا (معرفة، ذكاء اصطناعي،
 * مراجعة هندسية، تليجرام…) تكون **تسجيلًا فقط**، بلا أي تعديل على
 * الطابور ولا على وقت تشغيل العامل ولا على قاعدة البيانات.
 *
 * ملف واحد جديد + سطر تسجيل = عامل جديد. لا شيء غير ذلك.
 *
 * ```ts
 * defineJobHandler({
 *   type: "knowledge.classify",
 *   workerType: "ai",
 *   concurrency: 5,
 *   timeoutMs: 120_000,
 *   handler: async (ctx) => { … },
 * });
 * ```
 *
 * الفصل بين `type` (وحدة العمل) و`workerType` (من ينفّذها) مقصود:
 * عامل واحد يخدم عشرات الأنواع، ونقل نوع من عامل لآخر تغييرُ حقلٍ
 * واحد لا إعادة هيكلة.
 */

export interface JobHandlerDefinition<TPayload = Record<string, unknown>> {
  /** معرّف فريد للمهمة — يُستخدم في `jobs.type`. اصطلاح: `domain.action`. */
  type: string;

  /** أي عامل ينفّذها. يُستخدم في التوجيه والتوسّع التلقائي. */
  workerType: string;

  handler: JobHandler<TPayload>;

  /** أقصى تنفيذ متزامن لهذا النوع داخل نسخة العامل الواحدة. */
  concurrency?: number;

  /** الميزانية الزمنية. التجاوز يعني `timeout` لا `failed`. */
  timeoutMs?: number;

  maxAttempts?: number;
  defaultPriority?: JobPriority;

  /**
   * قفل المورد المطلوب قبل التنفيذ — يُشتقّ من الحمولة.
   *
   * مثال: `(p) => \`brain:${p.projectId}\`` يمنع إعادتَي توليد
   * متزامنتين لنفس Brain. `SKIP LOCKED` بيمنع سحب نفس **المهمة**
   * مرتين، لكنه لا يمنع مهمتين مختلفتين من الكتابة في نفس المورد.
   */
  lockKey?: (payload: TPayload) => string | null;

  /**
   * بصمة إسقاط التكرار — يُشتقّ من الحمولة.
   *
   * وجودها يعني: طلب متطابق بينما الأول لسه حيًّا يرجّع نفس المهمة
   * بدل إنشاء واحدة جديدة. هذا ما يحمي من الضغط المتكرر على زر.
   */
  dedupeHash?: (payload: TPayload) => string | null;

  /**
   * الأدوار المسموح لها بإدراج هذا النوع.
   *
   * الفحص هرمي عبر `lib/auth/roles`، فأي دور أعلى يمرّ تلقائيًا.
   * غياب الحقل يعني: أي مستخدم مسجّل دخول ونشط.
   */
  allowedRoles?: UserRole[];

  /** هل يجب أن يكون المستخدم عضوًا في المشروع؟ */
  requiresProjectMembership?: boolean;

  /** وصف عربي يظهر في لوحة المشغّل. */
  description?: string;
}

/** التعريف بعد تطبيق الافتراضات — ما يراه وقت التشغيل فعليًا. */
export interface ResolvedJobHandler<TPayload = Record<string, unknown>>
  extends JobHandlerDefinition<TPayload> {
  concurrency: number;
  timeoutMs: number;
  maxAttempts: number;
  defaultPriority: JobPriority;
}

export const HANDLER_DEFAULTS = {
  concurrency: 1,
  timeoutMs: 120_000,
  maxAttempts: 3,
  defaultPriority: "normal" as JobPriority,
};

// حالة على مستوى الوحدة: سجل واحد لكل عملية. العامل يستورد معالجاته
// عند الإقلاع، والتطبيق يستورد نفس السجل ليعرف الأنواع الصالحة.
const registry = new Map<string, ResolvedJobHandler<never>>();

export class DuplicateHandlerError extends Error {
  constructor(type: string) {
    super(`معالج مسجّل بالفعل لهذا النوع: ${type}`);
    this.name = "DuplicateHandlerError";
  }
}

export class UnknownJobTypeError extends Error {
  constructor(type: string) {
    super(`نوع مهمة غير مسجّل: ${type}`);
    this.name = "UnknownJobTypeError";
  }
}

/**
 * يسجّل معالجًا. **الدالة الوحيدة التي يحتاجها مطوّر عامل جديد.**
 *
 * التسجيل المكرّر يرمي بدل أن يستبدل: الاستبدال الصامت معناه أن ترتيب
 * الاستيراد يقرّر أي معالج يعمل فعلًا — وهذا خطأ يستحيل تشخيصه لاحقًا.
 */
export function defineJobHandler<TPayload = Record<string, unknown>>(
  definition: JobHandlerDefinition<TPayload>
): ResolvedJobHandler<TPayload> {
  if (registry.has(definition.type)) throw new DuplicateHandlerError(definition.type);

  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(definition.type)) {
    throw new Error(
      `نوع المهمة لازم يكون بصيغة "domain.action" بحروف صغيرة: ${definition.type}`
    );
  }

  const resolved: ResolvedJobHandler<TPayload> = {
    ...definition,
    concurrency: definition.concurrency ?? HANDLER_DEFAULTS.concurrency,
    timeoutMs: definition.timeoutMs ?? HANDLER_DEFAULTS.timeoutMs,
    maxAttempts: definition.maxAttempts ?? HANDLER_DEFAULTS.maxAttempts,
    defaultPriority: definition.defaultPriority ?? HANDLER_DEFAULTS.defaultPriority,
  };

  registry.set(definition.type, resolved as unknown as ResolvedJobHandler<never>);
  return resolved;
}

export function getJobHandler(type: string): ResolvedJobHandler | undefined {
  return registry.get(type) as ResolvedJobHandler | undefined;
}

/** يرمي لو النوع غير مسجّل — للمسارات اللي لازم تفشل بوضوح. */
export function requireJobHandler(type: string): ResolvedJobHandler {
  const handler = getJobHandler(type);
  if (!handler) throw new UnknownJobTypeError(type);
  return handler;
}

export function isRegisteredType(type: string): boolean {
  return registry.has(type);
}

export function listJobHandlers(): ResolvedJobHandler[] {
  return [...registry.values()] as ResolvedJobHandler[];
}

/**
 * كل الأنواع التي ينفّذها عامل معيّن — يستخدمها وقت التشغيل عند المطالبة.
 *
 * يقبل **قائمة مفصولة بفواصل**: `meeting,discovery`. السبب تشغيلي —
 * كل خدمة لها نوع عامل مستقل عشان تتوسّع وحدها وتتعطّل وحدها، لكن
 * تشغيل اثني عشر عملية على بيئة صغيرة إهدار. القائمة تسمح بجمعهم في
 * عملية واحدة وقت الحاجة **بلا تغيير في التسجيل ولا في وقت التشغيل**.
 */
export function handlerTypesForWorker(workerType: string): string[] {
  const wanted = new Set(
    workerType
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
  return listJobHandlers()
    .filter((h) => wanted.has(h.workerType))
    .map((h) => h.type);
}

export function listWorkerTypes(): string[] {
  return [...new Set(listJobHandlers().map((h) => h.workerType))].sort();
}

/** للاختبارات فقط — يمسح السجل بين الحالات. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
