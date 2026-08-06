import { describe, expect, it } from "vitest";
import { comparePhaseAuditFindings } from "./phase-audit-compare";

function f(key: string) {
  return { finding_key: key };
}

describe("comparePhaseAuditFindings", () => {
  it("يحسب Added/Fixed/Remaining صح لمزيج من findings مشتركة وجديدة وقديمة", () => {
    const result = comparePhaseAuditFindings([f("a"), f("b")], [f("b"), f("c")], 70, 85);
    expect(result.added.map((x) => x.finding_key)).toEqual(["c"]);
    expect(result.fixed.map((x) => x.finding_key)).toEqual(["a"]);
    expect(result.remaining.map((x) => x.finding_key)).toEqual(["b"]);
    expect(result.scoreDiff).toBe(15);
  });

  it("مفيش findings قديمة يخلي كل الجديد Added", () => {
    const result = comparePhaseAuditFindings([], [f("x")], 100, 90);
    expect(result.added).toHaveLength(1);
    expect(result.fixed).toHaveLength(0);
    expect(result.scoreDiff).toBe(-10);
  });

  it("نفس الـ findings بالظبط يخلي كله Remaining", () => {
    const shared = [f("a"), f("b")];
    const result = comparePhaseAuditFindings(shared, shared, 80, 80);
    expect(result.remaining).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.fixed).toHaveLength(0);
    expect(result.scoreDiff).toBe(0);
  });
});
