import { describe, expect, it } from "vitest";
import { detectOutcomeSignals, EQA_SCORE_THRESHOLD, NEGATIVE_SATISFACTION_MIN, CHANGE_REQUEST_THRESHOLD } from "./outcome-signals";
import { AITaskType } from "@/lib/ai/types";

describe("detectOutcomeSignals", () => {
  it("لا يولّد أي إشارة لو كل النتائج سليمة", () => {
    const signals = detectOutcomeSignals({ eqaOverallScore: 95, negativeSatisfactionCount: 0, changeRequestCount: 0 });
    expect(signals).toEqual([]);
  });

  it("يولّد إشارة Developer Handoff لدرجة EQA منخفضة", () => {
    const signals = detectOutcomeSignals({ eqaOverallScore: EQA_SCORE_THRESHOLD - 1, negativeSatisfactionCount: 0, changeRequestCount: 0 });
    expect(signals).toHaveLength(1);
    expect(signals[0].taskType).toBe(AITaskType.DEVELOPER_HANDOFF_GENERATION);
  });

  it("لا يولّد إشارة عند العتبة بالظبط (الشرط < صارم)", () => {
    const signals = detectOutcomeSignals({ eqaOverallScore: EQA_SCORE_THRESHOLD, negativeSatisfactionCount: 0, changeRequestCount: 0 });
    expect(signals).toEqual([]);
  });

  it("يتجاهل eqaOverallScore=null (مفيش دليل بعد)", () => {
    const signals = detectOutcomeSignals({ eqaOverallScore: null, negativeSatisfactionCount: 0, changeRequestCount: 0 });
    expect(signals).toEqual([]);
  });

  it("يولّد إشارة PRD لتقييمات عملاء سلبية", () => {
    const signals = detectOutcomeSignals({ eqaOverallScore: null, negativeSatisfactionCount: NEGATIVE_SATISFACTION_MIN, changeRequestCount: 0 });
    expect(signals).toHaveLength(1);
    expect(signals[0].taskType).toBe(AITaskType.PRD_GENERATION);
  });

  it("يولّد إشارة PRD لعدد كبير من change_request", () => {
    const signals = detectOutcomeSignals({ eqaOverallScore: null, negativeSatisfactionCount: 0, changeRequestCount: CHANGE_REQUEST_THRESHOLD });
    expect(signals).toHaveLength(1);
    expect(signals[0].taskType).toBe(AITaskType.PRD_GENERATION);
  });

  it("يولّد كل الإشارات المستقلة مع بعض لو كل الأدلة موجودة", () => {
    const signals = detectOutcomeSignals({
      eqaOverallScore: EQA_SCORE_THRESHOLD - 10,
      negativeSatisfactionCount: NEGATIVE_SATISFACTION_MIN,
      changeRequestCount: CHANGE_REQUEST_THRESHOLD,
    });
    expect(signals).toHaveLength(3);
  });
});
