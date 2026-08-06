import { describe, expect, it } from "vitest";
import { isDuplicateMatch, nextKnowledgeStatus, DEDUP_SIMILARITY_THRESHOLD, VALIDATION_OCCURRENCE_THRESHOLD } from "./knowledge-rules";

describe("isDuplicateMatch", () => {
  it("يعتبرها تكرار عند العتبة بالظبط", () => {
    expect(isDuplicateMatch(DEDUP_SIMILARITY_THRESHOLD)).toBe(true);
  });

  it("يعتبرها تكرار لتشابه أعلى من العتبة", () => {
    expect(isDuplicateMatch(0.95)).toBe(true);
  });

  it("لا يعتبرها تكرار لتشابه أقل من العتبة", () => {
    expect(isDuplicateMatch(0.5)).toBe(false);
  });
});

describe("nextKnowledgeStatus", () => {
  it("يفضل candidate لو التكرار أقل من العتبة", () => {
    expect(nextKnowledgeStatus("candidate", VALIDATION_OCCURRENCE_THRESHOLD - 1)).toBe("candidate");
  });

  it("يترقّى لـ validated عند الوصول لعتبة التكرار", () => {
    expect(nextKnowledgeStatus("candidate", VALIDATION_OCCURRENCE_THRESHOLD)).toBe("validated");
  });

  it("يترقّى لـ validated لتكرار أعلى من العتبة", () => {
    expect(nextKnowledgeStatus("candidate", VALIDATION_OCCURRENCE_THRESHOLD + 5)).toBe("validated");
  });

  it("لا يغيّر approved حتى لو التكرار قليل — قرار إنسان نهائي", () => {
    expect(nextKnowledgeStatus("approved", 1)).toBe("approved");
  });

  it("لا يغيّر rejected حتى لو التكرار عالي — قرار إنسان نهائي", () => {
    expect(nextKnowledgeStatus("rejected", 10)).toBe("rejected");
  });

  it("يفضل validated لو كان already validated وتكراره لسه فوق العتبة", () => {
    expect(nextKnowledgeStatus("validated", VALIDATION_OCCURRENCE_THRESHOLD)).toBe("validated");
  });
});
