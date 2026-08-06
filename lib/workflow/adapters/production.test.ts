import { describe, expect, it } from "vitest";
import { adaptProductionMonitoringPromptStage, adaptProductionMonitoringReviewStage, adaptProductionMonitoringStage } from "./production";

describe("adaptProductionMonitoringStage", () => {
  it("مفيش فحص خالص → not_started", () => {
    expect(adaptProductionMonitoringStage(null).status).toBe("not_started");
  });

  it("overall_status=healthy → completion 100", () => {
    const s = adaptProductionMonitoringStage({ status: "ready", overall_status: "healthy", last_error: null, updated_at: "x" });
    expect(s.completionPct).toBe(100);
  });

  it("overall_status=down → completion منخفضة", () => {
    const s = adaptProductionMonitoringStage({ status: "ready", overall_status: "down", last_error: null, updated_at: "x" });
    expect(s.completionPct).toBe(30);
  });
});

describe("adaptProductionMonitoringPromptStage", () => {
  it("مفيش حوادث مفتوحة → not_started (مفيش حاجة تتحلل)", () => {
    expect(adaptProductionMonitoringPromptStage([]).status).toBe("not_started");
  });

  it("كل الحوادث المفتوحة عندها Fix Prompts pending → completed", () => {
    const s = adaptProductionMonitoringPromptStage(
      [{ id: "inc-1", status: "open", root_cause: "سبب واضح", patch_proposal: "", last_seen_at: "x" }],
      [{ incident_id: "inc-1", status: "pending" }]
    );
    expect(s.status).toBe("completed");
  });

  it("حادثة لسه من غير Fix Prompts → waiting_ai", () => {
    const s = adaptProductionMonitoringPromptStage([{ id: "inc-1", status: "open", root_cause: "", patch_proposal: "", last_seen_at: "x" }], []);
    expect(s.status).toBe("waiting_ai");
  });
});

describe("adaptProductionMonitoringReviewStage", () => {
  it("فحص لسه مش جاهز → not_started", () => {
    expect(adaptProductionMonitoringReviewStage({ status: "running", overall_status: null, last_error: null, updated_at: "x" }).status).toBe(
      "not_started"
    );
  });

  it("فحص جاهز بس لسه مفيش قرار → waiting_review", () => {
    expect(adaptProductionMonitoringReviewStage({ status: "ready", overall_status: "healthy", last_error: null, updated_at: "x" }).status).toBe(
      "waiting_review"
    );
  });

  it("pm_approval_status=rejected → rejected", () => {
    expect(
      adaptProductionMonitoringReviewStage({
        status: "ready",
        overall_status: "degraded",
        last_error: null,
        updated_at: "x",
        pm_approval_status: "rejected",
        pm_approved_at: "2026-01-01",
      }).status
    ).toBe("rejected");
  });
});
