import { describe, expect, it } from "vitest";
import { adaptEngineeringQaReviewStage, adaptEngineeringQaStage, adaptFixPromptStage } from "./engineering";

describe("adaptEngineeringQaStage", () => {
  it("مفيش مراجعة خالص → not_started", () => {
    expect(adaptEngineeringQaStage(null).status).toBe("not_started");
  });

  it("review_status=completed → completed", () => {
    expect(
      adaptEngineeringQaStage({ review_status: "completed", overall_progress: 100, last_error: null, updated_at: "x" }).status
    ).toBe("completed");
  });

  it("review_status=needs_review → waiting_review", () => {
    expect(
      adaptEngineeringQaStage({ review_status: "needs_review", overall_progress: 90, last_error: null, updated_at: "x" }).status
    ).toBe("waiting_review");
  });
});

describe("adaptFixPromptStage", () => {
  it("مفيش أي Fix Loop خالص → not_started (مفيش حاجة تتصلح، مش عيب)", () => {
    expect(adaptFixPromptStage(null).status).toBe("not_started");
  });

  it("status=fixed → completed", () => {
    expect(
      adaptFixPromptStage({ status: "fixed", fix_prompt: "...", fix_task_id: "t1", attempt_number: 1, updated_at: "x" }).status
    ).toBe("completed");
  });

  it("status=running من غير fix_task_id لسه → completion أقل", () => {
    const s = adaptFixPromptStage({ status: "running", fix_prompt: null, fix_task_id: null, attempt_number: 1, updated_at: "x" });
    expect(s.status).toBe("waiting_ai");
    expect(s.completionPct).toBe(30);
  });

  it("status=max_attempts_reached → in_progress (يحتاج تدخّل بشري)", () => {
    expect(
      adaptFixPromptStage({ status: "max_attempts_reached", fix_prompt: "...", fix_task_id: "t1", attempt_number: 3, updated_at: "x" }).status
    ).toBe("in_progress");
  });
});

describe("adaptEngineeringQaReviewStage", () => {
  it("QA لسه ماخلصتش → not_started (البوابة مش جاهزة)", () => {
    expect(
      adaptEngineeringQaReviewStage({ review_status: "running", overall_progress: 40, last_error: null, updated_at: "x" }).status
    ).toBe("not_started");
  });

  it("QA خلصت بس لسه مفيش قرار → waiting_review", () => {
    expect(
      adaptEngineeringQaReviewStage({ review_status: "completed", overall_progress: 100, last_error: null, updated_at: "x" }).status
    ).toBe("waiting_review");
  });

  it("pm_approval_status=approved → approved", () => {
    expect(
      adaptEngineeringQaReviewStage({
        review_status: "completed",
        overall_progress: 100,
        last_error: null,
        updated_at: "x",
        pm_approval_status: "approved",
        pm_approved_at: "2026-01-01",
      }).status
    ).toBe("approved");
  });
});
