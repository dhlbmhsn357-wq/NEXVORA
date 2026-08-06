import { describe, expect, it } from "vitest";
import { adaptBrainReviewStage, adaptProjectBrainStage, adaptSmartRecommendationsStage } from "./brain";

const doc = { status: "draft", version: 1, completeness_score: 65, updated_at: "x" };

describe("adaptProjectBrainStage", () => {
  it("مفيش وثيقة خالص → not_started", () => {
    expect(adaptProjectBrainStage(null, null).status).toBe("not_started");
  });

  it("فيه نسخة معتمدة → approved 100 حتى لو completeness_score أقل", () => {
    const s = adaptProjectBrainStage(doc, { ...doc, status: "approved" });
    expect(s.status).toBe("approved");
    expect(s.completionPct).toBe(100);
  });

  it("لسه draft بلا اعتماد → in_progress بنسبة completeness_score", () => {
    const s = adaptProjectBrainStage(doc, null);
    expect(s.status).toBe("in_progress");
    expect(s.completionPct).toBe(65);
  });
});

describe("adaptSmartRecommendationsStage", () => {
  it("مفيش توصيات → not_started", () => {
    expect(adaptSmartRecommendationsStage([]).status).toBe("not_started");
  });
  it("فيه توصيات لسه suggested → waiting_review", () => {
    expect(adaptSmartRecommendationsStage([{ status: "suggested" }, { status: "accepted" }]).status).toBe("waiting_review");
  });
  it("كل التوصيات محسومة (مفيش suggested) → completed", () => {
    expect(adaptSmartRecommendationsStage([{ status: "accepted" }, { status: "dismissed" }]).status).toBe("completed");
  });
});

describe("adaptBrainReviewStage", () => {
  it("status=rejected → rejected", () => {
    expect(adaptBrainReviewStage({ ...doc, status: "rejected" }).status).toBe("rejected");
  });
});
