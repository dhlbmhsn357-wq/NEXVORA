import type { JobPriority } from "./types";

/**
 * نظام الأولويات — وحدة نقية.
 *
 * الترتيب هنا هو ترتيب التنفيذ الفعلي. الرقم الأصغر = الأعلى أولوية،
 * ليطابق `order by` تصاعديًا في قاعدة البيانات مباشرة.
 */

export const PRIORITY_RANK: Record<JobPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  background: 4,
};

export const PRIORITY_LABELS: Record<JobPriority, string> = {
  critical: "حرجة",
  high: "عالية",
  normal: "عادية",
  low: "منخفضة",
  background: "خلفية",
};

export const ALL_PRIORITIES: readonly JobPriority[] = [
  "critical",
  "high",
  "normal",
  "low",
  "background",
];

/**
 * الأولوية الافتراضية لكل فئة عمل.
 *
 * هذه إرشادية لا ملزمة — المستدعي يقدر يتجاوزها. لكن وجودها في مكان
 * واحد بيمنع الانحراف التدريجي اللي بيخلّي كل مطوّر يختار «عالية»
 * لمهمته، فتفقد الأولويات معناها بالكامل.
 */
export const DEFAULT_PRIORITY_BY_CATEGORY: Record<string, JobPriority> = {
  interactive: "critical", // المستخدم واقف مستني
  user_requested: "high", // طلبها صراحة وسابها
  cascade: "normal", // نتجت عن حدث
  analysis: "low", // تحليل ثقيل غير عاجل
  maintenance: "background", // صيانة دورية
};

export function comparePriority(a: JobPriority, b: JobPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

/**
 * الحد الذي تبدأ بعده الترقية ضد التجويع.
 *
 * بدون هذه القاعدة تفضل مهام `background` في الطابور **إلى الأبد** طول
 * ما فيه مهام أعلى بتوصل باستمرار. وده مش احتمال نظري: كرون كل ربع
 * ساعة كفيل بتجويع مهام الخلفية دائمًا.
 */
export const STARVATION_THRESHOLD_MS = 60 * 60 * 1000;

/** ترقية درجة إضافية لكل ساعة انتظار بعد الأولى. */
export const STARVATION_STEP_MS = 60 * 60 * 1000;

/**
 * الأولوية الفعلية بعد احتساب مدة الانتظار.
 *
 * تُستخدم في الترتيب داخل التطبيق وفي لوحة المشغّل. الترتيب في قاعدة
 * البيانات يعتمد على `(priority, created_at)` وهو يعطي نفس النتيجة
 * عمليًا للمهام من نفس الأولوية، وترقية `available_at` تتكفّل بالباقي.
 */
export function effectivePriority(priority: JobPriority, waitedMs: number): JobPriority {
  if (waitedMs < STARVATION_THRESHOLD_MS) return priority;

  const steps = 1 + Math.floor((waitedMs - STARVATION_THRESHOLD_MS) / STARVATION_STEP_MS);
  const promotedRank = Math.max(0, PRIORITY_RANK[priority] - steps);

  return (
    ALL_PRIORITIES.find((p) => PRIORITY_RANK[p] === promotedRank) ?? "critical"
  );
}

export interface SortableJob {
  priority: JobPriority;
  createdAt: Date;
}

/**
 * ترتيب المهام كما ستُنفَّذ.
 *
 * الأولوية أولًا، ثم الأقدم أولًا داخل نفس الأولوية (منع تجويع محلي).
 * الترقية ضد التجويع محتسَبة، فمهمة خلفية انتظرت ساعتين تسبق مهمة
 * منخفضة وصلت للتو.
 */
export function sortByExecutionOrder<T extends SortableJob>(jobs: T[], now: Date): T[] {
  return [...jobs].sort((a, b) => {
    const aPriority = effectivePriority(a.priority, now.getTime() - a.createdAt.getTime());
    const bPriority = effectivePriority(b.priority, now.getTime() - b.createdAt.getTime());

    const byPriority = comparePriority(aPriority, bPriority);
    if (byPriority !== 0) return byPriority;

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * عتبات الضغط العكسي.
 *
 * المبدأ: الرفض الصريح مع سبب مفهوم أفضل من القبول ثم انتظار ساعتين
 * بلا تفسير. المستخدم يقدر يتعامل مع «النظام مشغول، جرّب بعد شوية»؛
 * ومايقدرش يتعامل مع الصمت.
 */
export const BACKPRESSURE_SOFT_LIMIT = 500;
export const BACKPRESSURE_HARD_LIMIT = 2_000;

export type AdmissionDecision =
  | { admit: true }
  | { admit: false; reason: string };

/** هل نقبل مهمة جديدة بهذه الأولوية والطابور بهذا العمق؟ */
export function decideAdmission(queueDepth: number, priority: JobPriority): AdmissionDecision {
  if (queueDepth < BACKPRESSURE_SOFT_LIMIT) return { admit: true };

  if (queueDepth < BACKPRESSURE_HARD_LIMIT) {
    if (PRIORITY_RANK[priority] <= PRIORITY_RANK.normal) return { admit: true };
    return {
      admit: false,
      reason: `الطابور مزدحم (${queueDepth} مهمة). المهام منخفضة الأولوية مؤجَّلة مؤقتًا — جرّب بعد شوية.`,
    };
  }

  if (priority === "critical") return { admit: true };
  return {
    admit: false,
    reason: `الطابور محمّل بالكامل (${queueDepth} مهمة). المهام الحرجة فقط مقبولة دلوقتي.`,
  };
}
