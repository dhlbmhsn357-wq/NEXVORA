import { describe, expect, it } from "vitest";
import {
  findNextStageToRun,
  allStagesCompleted,
  calculateReviewProgress,
  estimateRemainingSeconds,
} from "./next-stage";
import type { EngineeringReviewStage, EngineeringReviewStageStatus } from "@/lib/types/database";

function stage(
  order: number,
  status: EngineeringReviewStageStatus,
  durationSeconds: number | null = null
): EngineeringReviewStage {
  return {
    id: `stage-${order}`,
    review_id: "review-1",
    project_id: "project-1",
    stage_key: `stage_${order}`,
    stage_name: `مرحلة ${order}`,
    execution_order: order,
    stage_status: status,
    stage_version: 1,
    retry_count: 0,
    last_error: null,
    started_at: null,
    finished_at: null,
    duration_seconds: durationSeconds,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("findNextStageToRun", () => {
  it("يرجّع أول مرحلة pending لو الترتيب كله pending", () => {
    const stages = [stage(1, "pending"), stage(2, "pending"), stage(3, "pending")];
    expect(findNextStageToRun(stages)?.execution_order).toBe(1);
  });

  it("يرجّع null لو فيه مرحلة شغّالة بالفعل (منع تعارض)", () => {
    const stages = [stage(1, "running"), stage(2, "pending")];
    expect(findNextStageToRun(stages)).toBeNull();
  });

  it("يتخطى المراحل المكتملة ويلاقي أول pending بالترتيب", () => {
    const stages = [stage(1, "completed"), stage(2, "completed"), stage(3, "pending"), stage(4, "pending")];
    expect(findNextStageToRun(stages)?.execution_order).toBe(3);
  });

  it("يتوقف تلقائيًا عند أول مرحلة فشلت — ميكملش للي بعدها", () => {
    const stages = [stage(1, "completed"), stage(2, "failed"), stage(3, "pending")];
    expect(findNextStageToRun(stages)).toBeNull();
  });

  it("يتوقف عند مرحلة أُلغيت برضه", () => {
    const stages = [stage(1, "completed"), stage(2, "cancelled"), stage(3, "pending")];
    expect(findNextStageToRun(stages)).toBeNull();
  });

  it("يرجّع null لو كل المراحل خلصت", () => {
    const stages = [stage(1, "completed"), stage(2, "completed")];
    expect(findNextStageToRun(stages)).toBeNull();
  });
});

describe("allStagesCompleted", () => {
  it("يرجّع true بس لو كل المراحل completed", () => {
    expect(allStagesCompleted([stage(1, "completed"), stage(2, "completed")])).toBe(true);
  });

  it("يرجّع false لو مرحلة واحدة لسه مش completed", () => {
    expect(allStagesCompleted([stage(1, "completed"), stage(2, "pending")])).toBe(false);
  });

  it("يرجّع false لمصفوفة فاضية", () => {
    expect(allStagesCompleted([])).toBe(false);
  });
});

describe("calculateReviewProgress", () => {
  it("يحسب النسبة صح لمزيج من الحالات", () => {
    const stages = [stage(1, "completed"), stage(2, "completed"), stage(3, "running"), stage(4, "pending")];
    const progress = calculateReviewProgress(stages);
    expect(progress.overallProgress).toBe(50);
    expect(progress.completedStages).toBe(2);
    expect(progress.totalStages).toBe(4);
    expect(progress.remainingStages).toBe(2);
    expect(progress.currentStage?.execution_order).toBe(3);
  });

  it("يرجّع 0% لمصفوفة فاضية بدون قسمة على صفر", () => {
    const progress = calculateReviewProgress([]);
    expect(progress.overallProgress).toBe(0);
    expect(progress.currentStage).toBeNull();
  });

  it("currentStage بيبقى أول مرحلة مش completed لو مفيش حاجة شغّالة دلوقتي", () => {
    const stages = [stage(1, "completed"), stage(2, "failed"), stage(3, "pending")];
    const progress = calculateReviewProgress(stages);
    expect(progress.currentStage?.execution_order).toBe(2);
  });
});

describe("estimateRemainingSeconds", () => {
  it("يرجّع null لو لسه مفيش مرحلة خلصت (مفيش أساس نحسب عليه)", () => {
    const stages = [stage(1, "running"), stage(2, "pending")];
    expect(estimateRemainingSeconds(stages, 2)).toBeNull();
  });

  it("يرجّع null لو مفيش مراحل متبقية", () => {
    const stages = [stage(1, "completed", 30)];
    expect(estimateRemainingSeconds(stages, 0)).toBeNull();
  });

  it("يحسب تقدير معقول بناءً على وسيط مدة المراحل المكتملة فعليًا", () => {
    // مرحلتين خلصوا فعلاً في 10 و20 ثانية → الوسيط 15 × 3 مراحل متبقية = 45
    const stages = [stage(1, "completed", 10), stage(2, "completed", 20), stage(3, "running")];
    expect(estimateRemainingSeconds(stages, 3)).toBe(45);
  });

  it("مرحلة شغالة/عالقة حاليًا (retry loop) ملهاش أي تأثير على التقدير", () => {
    // المرحلة الشغالة مفيهاش duration_seconds لسه (لسه ما خلصتش) — لازم تتجاهل تمامًا
    const stagesWithStuckCurrent = [stage(1, "completed", 10), stage(2, "completed", 20), stage(3, "running")];
    const stagesWithoutStuckCurrent = [stage(1, "completed", 10), stage(2, "completed", 20)];
    expect(estimateRemainingSeconds(stagesWithStuckCurrent, 3)).toBe(
      estimateRemainingSeconds(stagesWithoutStuckCurrent, 3)
    );
  });

  it("التقدير محدود بسقف أقصى (3 ساعات) حتى لو مرحلة واحدة أخدت وقت شاذ جدًا", () => {
    const stages = [stage(1, "completed", 36_000), stage(2, "completed", 36_000)];
    expect(estimateRemainingSeconds(stages, 5)).toBe(60 * 60 * 3);
  });
});
