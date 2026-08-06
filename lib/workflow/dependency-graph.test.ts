import { describe, expect, it } from "vitest";
import { computeStaleness, getDownstreamOf, getUpstreamOf } from "./dependency-graph";
import { NEUTRAL_VERSION_INFO } from "./types";
import type { StageState } from "./types";

function state(status: StageState["status"], isStale = false): StageState {
  return {
    key: "prd",
    status,
    completionPct: 100,
    versionInfo: { ...NEUTRAL_VERSION_INFO, isStale, staleReason: isStale ? "تغيّر المصدر." : null },
    lastError: null,
    updatedAt: null,
  };
}

describe("getUpstreamOf / getDownstreamOf", () => {
  it("prd بيعتمد على brainReview مباشرة", () => {
    expect(getUpstreamOf("prd")).toEqual(["brainReview"]);
  });

  it("brainReview من مراحلها التابعة (Downstream) لازم يكون فيها prd", () => {
    expect(getDownstreamOf("brainReview")).toContain("prd");
  });
});

describe("computeStaleness", () => {
  it("مرحلة من غير isStale مباشرة ومن غير مصدر Stale ترجع stale=false", () => {
    const result = computeStaleness({ prd: state("completed", false) });
    expect(result.prd.stale).toBe(false);
    expect(result.prd.source).toBeNull();
  });

  it("مرحلة isStale مباشرة بترجع source=direct", () => {
    const result = computeStaleness({ prd: state("completed", true) });
    expect(result.prd.stale).toBe(true);
    expect(result.prd.source).toBe("direct");
  });

  it("لو مرحلة أعلى (upstream) عليها Stale، المرحلة اللي بعدها تتعلّم transitive حتى لو نسختها هي شخصيًا متوافقة", () => {
    const result = computeStaleness({
      projectBrain: state("approved", true),
      brainReview: state("approved", false),
    });
    expect(result.projectBrain.stale).toBe(true);
    expect(result.projectBrain.source).toBe("direct");
    expect(result.brainReview.stale).toBe(true);
    expect(result.brainReview.source).toBe("transitive");
  });

  it("الانتشار Transitive يوصل لأكتر من مرحلة في السلسلة (مش بس القريب المباشر)", () => {
    const result = computeStaleness({
      projectBrain: state("approved", true),
      brainReview: state("approved", false),
      prd: state("completed", false),
    });
    expect(result.prd.stale).toBe(true);
    expect(result.prd.source).toBe("transitive");
  });

  it("مرحلة مفيهاش State خالص (لسه ماتولّدتش) بترجع stale=false، مش بتكسر الحساب", () => {
    const result = computeStaleness({});
    expect(result.support.stale).toBe(false);
    expect(Object.keys(result).length).toBeGreaterThan(20);
  });
});
