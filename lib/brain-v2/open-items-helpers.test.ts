import { describe, expect, it } from "vitest";
import { computeOpenItemsPendingCount, isOpenItemPending } from "./open-items-helpers";
import type { BrainContent, MissingInfoItem, AssumptionItem, BrainSectionMeta } from "./types";

const meta: BrainSectionMeta = {
  confidence: 90,
  confidence_reason: null,
  evidence: [],
  source: "ai_analysis",
  last_updated: new Date().toISOString(),
};

function buildContent(missing: MissingInfoItem[], assumptions: AssumptionItem[]): BrainContent {
  return {
    missing_information: { content: missing, meta },
    assumptions: { content: assumptions, meta },
  } as unknown as BrainContent;
}

describe("isOpenItemPending", () => {
  it("يعتبر undefined أو state=pending معلّق", () => {
    expect(isOpenItemPending(undefined)).toBe(true);
    expect(isOpenItemPending({ state: "pending" })).toBe(true);
  });

  it("يعتبر أي حالة تانية غير معلّقة", () => {
    expect(isOpenItemPending({ state: "resolved", by: null, at: "", note: "تم" })).toBe(false);
    expect(isOpenItemPending({ state: "accepted", by: null, at: "" })).toBe(false);
  });
});

describe("computeOpenItemsPendingCount", () => {
  it("يحسب العدّ الصحيح لمعلومات ناقصة وافتراضات معلّقة ومحسومة مع بعض", () => {
    const missing: MissingInfoItem[] = [
      { info: "١", impact: "high", reason: "س" },
      { info: "٢", impact: "low", reason: "س" },
    ];
    const assumptions: AssumptionItem[] = [
      { statement: "١", reason: "س", evidence: [] },
      { statement: "٢", reason: "س", evidence: [] },
      { statement: "٣", reason: "س", evidence: [] },
    ];
    const content = buildContent(missing, assumptions);

    const result = computeOpenItemsPendingCount(
      content,
      { "0": { state: "resolved", by: null, at: "", note: "تم" } },
      { "0": { state: "accepted", by: null, at: "" }, "1": { state: "rejected", by: null, at: "", reason: null } }
    );

    expect(result.missingPending).toBe(1); // index 1 لسه pending
    expect(result.assumptionPending).toBe(1); // index 2 لسه pending
    expect(result.totalPending).toBe(2);
    expect(result.totalItems).toBe(5);
  });

  it("يرجّع صفر لو كل البنود محسومة", () => {
    const content = buildContent(
      [{ info: "١", impact: "high", reason: "س" }],
      [{ statement: "١", reason: "س", evidence: [] }]
    );
    const result = computeOpenItemsPendingCount(
      content,
      { "0": { state: "ignored", by: null, at: "", reason: null } },
      { "0": { state: "accepted", by: null, at: "" } }
    );
    expect(result.totalPending).toBe(0);
    expect(result.totalItems).toBe(2);
  });

  it("يرجّع صفر لقوائم فاضية", () => {
    const content = buildContent([], []);
    const result = computeOpenItemsPendingCount(content, {}, {});
    expect(result.totalPending).toBe(0);
    expect(result.totalItems).toBe(0);
  });
});
