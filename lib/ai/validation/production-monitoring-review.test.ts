import { describe, expect, it } from "vitest";
import { validateReviewVerdicts } from "./production-monitoring-review";

const validIds = new Set(["inc-1", "inc-2"]);

describe("validateReviewVerdicts", () => {
  it("رد فارغ → فشل", () => {
    expect(validateReviewVerdicts(null, validIds).ok).toBe(false);
  });

  it("JSON غير صالح → فشل", () => {
    expect(validateReviewVerdicts("not json", validIds).ok).toBe(false);
  });

  it("verdicts مش مصفوفة → فشل", () => {
    expect(validateReviewVerdicts(JSON.stringify({ verdicts: "x" }), validIds).ok).toBe(false);
  });

  it("incident_id غير معروف (Hallucination) → يُسقط بهدوء بدل ما يفشل كله", () => {
    const raw = JSON.stringify({
      verdicts: [
        { incident_id: "inc-1", verdict: "solved_completely", evidence: "test passed", explanation: "fixed" },
        { incident_id: "made-up-id", verdict: "solved_completely", evidence: "x", explanation: "y" },
      ],
    });
    const result = validateReviewVerdicts(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].incident_id).toBe("inc-1");
    }
  });

  it("verdict غير صالح → يُسقط", () => {
    const raw = JSON.stringify({ verdicts: [{ incident_id: "inc-1", verdict: "made_up_verdict", evidence: "", explanation: "" }] });
    const result = validateReviewVerdicts(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(0);
  });

  it("verdicts صالحة متعددة → كلها تعدّى", () => {
    const raw = JSON.stringify({
      verdicts: [
        { incident_id: "inc-1", verdict: "solved_partially", evidence: "e1", explanation: "x1" },
        { incident_id: "inc-2", verdict: "regression_found", evidence: "e2", explanation: "x2" },
      ],
    });
    const result = validateReviewVerdicts(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(2);
  });
});
