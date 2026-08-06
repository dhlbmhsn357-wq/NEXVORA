import { describe, expect, it } from "vitest";
import { computeOverallFixScore, incidentsNeedingNewFixPrompts } from "./review-scoring";
import type { MonitoringReviewVerdict } from "@/lib/types/database";

function verdict(incident_id: string, verdict: MonitoringReviewVerdict["verdict"]): MonitoringReviewVerdict {
  return { incident_id, verdict, evidence: "", explanation: "" };
}

describe("computeOverallFixScore", () => {
  it("بلا أحكام → null (مش صفر)", () => {
    expect(computeOverallFixScore([])).toBeNull();
  });

  it("كل الحوادث solved_completely → 100", () => {
    expect(computeOverallFixScore([verdict("a", "solved_completely"), verdict("b", "solved_completely")])).toBe(100);
  });

  it("مزيج أحكام → متوسط مقصوص بين 0 و100", () => {
    const score = computeOverallFixScore([verdict("a", "solved_completely"), verdict("b", "still_exists")]);
    expect(score).toBe(50);
  });

  it("أحكام سالبة (تراجع) → متوسط لا يقل عن صفر", () => {
    const score = computeOverallFixScore([verdict("a", "regression_found"), verdict("b", "new_issues_introduced")]);
    expect(score).toBe(0);
  });

  it("still_exists لوحدها → 0", () => {
    expect(computeOverallFixScore([verdict("a", "still_exists")])).toBe(0);
  });
});

describe("incidentsNeedingNewFixPrompts", () => {
  it("solved_completely مش محتاجة جولة جديدة", () => {
    expect(incidentsNeedingNewFixPrompts([verdict("a", "solved_completely")])).toEqual([]);
  });

  it("أي حكم غير solved_completely بيرجع الـ incident_id", () => {
    expect(
      incidentsNeedingNewFixPrompts([verdict("a", "solved_completely"), verdict("b", "solved_partially"), verdict("c", "regression_found")])
    ).toEqual(["b", "c"]);
  });
});
