import { describe, expect, it } from "vitest";
import { calculateAiCompletion, calculateHumanCompletion, calculateReadiness, calculateReviewCompletion, calculateWeightedCompletion } from "./progress-engine";
import { NEUTRAL_VERSION_INFO } from "./types";
import type { StageState, WorkflowStageKey } from "./types";

function state(key: WorkflowStageKey, status: StageState["status"], completionPct = 0): StageState {
  return { key, status, completionPct, versionInfo: NEUTRAL_VERSION_INFO, lastError: null, updatedAt: null };
}

describe("calculateWeightedCompletion", () => {
  it("مفيش أي StageState خالص → 0", () => {
    expect(calculateWeightedCompletion({})).toBe(0);
  });

  it("كل المراحل completed 100% → المتوسط 100", () => {
    const states: Partial<Record<WorkflowStageKey, StageState>> = {};
    const keys: WorkflowStageKey[] = ["overview", "discovery", "analysis"];
    for (const k of keys) states[k] = state(k, "completed", 100);
    // باقي المراحل مش موجودة → completionPct فعلي = 0 (STATUS_WEIGHT["not_started"])، فمتوسط عام مش 100
    const result = calculateWeightedCompletion(states);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });

  it("لو الـ Adapter مادّاش completionPct (0)، بيرجع لوزن الـ status نفسه بدل الصفر الحرفي", () => {
    const result = calculateWeightedCompletion({ prd: state("prd", "waiting_review", 0) });
    // waiting_review وزنها 70 في progress-engine — مش صفر رغم إن completionPct = 0
    expect(result).toBeGreaterThan(0);
  });
});

describe("calculateAiCompletion / calculateReviewCompletion / calculateHumanCompletion", () => {
  it("كل فئة بتحسب المتوسط بتاعها بس، مش كل المراحل", () => {
    const states: Partial<Record<WorkflowStageKey, StageState>> = {
      prd: state("prd", "completed", 100), // AI stage
      brainReview: state("brainReview", "approved", 100), // Review stage
      overview: state("overview", "completed", 100), // Human stage
    };
    expect(calculateAiCompletion(states)).toBeGreaterThan(0);
    expect(calculateReviewCompletion(states)).toBeGreaterThan(0);
    expect(calculateHumanCompletion(states)).toBeGreaterThan(0);
  });
});

describe("calculateReadiness", () => {
  it("بترجع الأربع أبعاد كلهم أرقام بين 0-100", () => {
    const readiness = calculateReadiness({ prd: state("prd", "completed", 100) });
    expect(readiness.overall).toBeGreaterThanOrEqual(0);
    expect(readiness.engineering).toBeGreaterThanOrEqual(0);
    expect(readiness.deployment).toBeGreaterThanOrEqual(0);
    expect(readiness.support).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(readiness)) expect(v).toBeLessThanOrEqual(100);
  });
});
