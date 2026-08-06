import type { EngineeringReviewStage } from "@/lib/types/database";

/**
 * قرار "إيه المرحلة اللي تتشغّل بعده" — منطق خالص بدون state أو side
 * effect. المراحل بتتشغّل بالتسلسل الصارم بترتيب execution_order —
 * أول مرحلة لسه مش "completed" هي اللي بتحدد الموقف:
 *   - "pending"   → جاهزة تتشغّل (يترجع هي).
 *   - "running"   → فيه مرحلة شغّالة بالفعل، منع تشغيل مرحلتين
 *                   متعارضتين في نفس الوقت (يترجع null).
 *   - "failed"/"cancelled" → توقف تلقائي هنا؛ محتاج تدخّل يدوي
 *                   (Retry Stage) قبل ما أي مرحلة بعدها تتشغّل.
 */
export function findNextStageToRun(stages: EngineeringReviewStage[]): EngineeringReviewStage | null {
  const ordered = [...stages].sort((a, b) => a.execution_order - b.execution_order);
  const current = ordered.find((s) => s.stage_status !== "completed");
  if (!current) return null;
  return current.stage_status === "pending" ? current : null;
}

export function allStagesCompleted(stages: EngineeringReviewStage[]): boolean {
  return stages.length > 0 && stages.every((s) => s.stage_status === "completed");
}

export interface ReviewProgress {
  overallProgress: number;
  completedStages: number;
  totalStages: number;
  currentStage: EngineeringReviewStage | null;
  remainingStages: number;
}

/** حساب التقدّم الكلي — مشتق بالكامل من حالة المراحل، بدون تخزين منفصل. */
export function calculateReviewProgress(stages: EngineeringReviewStage[]): ReviewProgress {
  const totalStages = stages.length;
  const completedStages = stages.filter((s) => s.stage_status === "completed").length;
  const ordered = [...stages].sort((a, b) => a.execution_order - b.execution_order);
  const currentStage = ordered.find((s) => s.stage_status === "running") ?? ordered.find((s) => s.stage_status !== "completed") ?? null;

  return {
    overallProgress: totalStages === 0 ? 0 : Math.round((completedStages / totalStages) * 100),
    completedStages,
    totalStages,
    currentStage,
    remainingStages: totalStages - completedStages,
  };
}

/** أقصى تقدير معروض — بعد الحد ده التقدير الدقيق مش مفيد (فايدته تبقى مضللة أكتر منها مفيدة). */
const MAX_ESTIMATE_SECONDS = 60 * 60 * 3;

/**
 * تقدير الوقت المتبقي — الوسيط (median) لمدة المراحل المكتملة فعليًا
 * (duration_seconds لكل مرحلة) × عدد المراحل الباقية.
 *
 * ليه مش متوسط الوقت الكلي منذ بداية المراجعة؟ لأن لو مرحلة شغالة
 * حاليًا عالقة (زي retry بسبب Gemini quota) فوقتها بيتحسب في
 * الـ elapsed time من غير ما تخلص أصلًا، فالتقدير كان بينفجر لأرقام
 * زي "4054 دقيقة". الاعتماد على مدة المراحل *المكتملة فقط* (اللي
 * فعلاً خلصت) بيفصل التقدير تمامًا عن أي مرحلة عالقة حاليًا،
 * والوسيط (مش المتوسط) بيقاوم أي مرحلة واحدة أخدت وقت شاذ.
 */
export function estimateRemainingSeconds(stages: EngineeringReviewStage[], remainingStages: number): number | null {
  if (remainingStages <= 0) return null;
  const completedDurations = stages
    .filter((s): s is EngineeringReviewStage & { duration_seconds: number } =>
      s.stage_status === "completed" && typeof s.duration_seconds === "number" && s.duration_seconds > 0
    )
    .map((s) => s.duration_seconds);
  if (completedDurations.length === 0) return null;

  const sorted = [...completedDurations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianPerStage = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const estimate = Math.round(medianPerStage * remainingStages);
  return Math.min(estimate, MAX_ESTIMATE_SECONDS);
}
