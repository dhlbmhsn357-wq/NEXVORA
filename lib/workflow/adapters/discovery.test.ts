import { describe, expect, it } from "vitest";
import { adaptAnalysisStage, adaptDiscoveryStage, adaptOverviewStage } from "./discovery";

describe("adaptOverviewStage", () => {
  it("دايمًا completed 100 — مرحلة مرجعية دايمة", () => {
    expect(adaptOverviewStage().status).toBe("completed");
  });
});

describe("adaptDiscoveryStage", () => {
  it("مفيش فورم خالص → not_started", () => {
    expect(adaptDiscoveryStage(null).status).toBe("not_started");
  });

  it("status=draft → in_progress", () => {
    expect(adaptDiscoveryStage({ status: "draft" }).status).toBe("in_progress");
  });

  it("status=sent → waiting_review", () => {
    expect(adaptDiscoveryStage({ status: "sent" }).status).toBe("waiting_review");
  });

  it("status=submitted → completed 100", () => {
    const s = adaptDiscoveryStage({ status: "submitted" });
    expect(s.status).toBe("completed");
    expect(s.completionPct).toBe(100);
  });
});

describe("adaptAnalysisStage", () => {
  it("مفيش تحليل خالص → not_started", () => {
    expect(adaptAnalysisStage(null).status).toBe("not_started");
  });

  it("status=completed → completed", () => {
    expect(adaptAnalysisStage({ status: "completed", finished_at: "2026-01-01" }).status).toBe("completed");
  });

  it("status=failed → in_progress مع last_error", () => {
    const s = adaptAnalysisStage({ status: "failed", finished_at: null, last_error: "فشل الاتصال" });
    expect(s.status).toBe("in_progress");
    expect(s.lastError).toBe("فشل الاتصال");
  });

  it("status=generating → waiting_ai", () => {
    expect(adaptAnalysisStage({ status: "generating", finished_at: null }).status).toBe("waiting_ai");
  });
});
