import { describe, it, expect } from "vitest";
import { validateProjectAssistantAnswer } from "./project-assistant-qa";

const VALID_IDS = new Set(["src-1", "src-2"]);

function validPayload(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    answer_text: "الإجابة مبنية على القرار المعتمد.",
    answer_status: "approved",
    cited_source_ids: ["src-1"],
    conflict_explained: false,
    ...overrides,
  });
}

describe("validateProjectAssistantAnswer", () => {
  it("accepts a well-formed response referencing only real source ids", () => {
    const result = validateProjectAssistantAnswer(validPayload(), VALID_IDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answerStatus).toBe("approved");
    expect(result.data.citedSourceIds).toEqual(["src-1"]);
    expect(result.warnings).toEqual([]);
  });

  it("strips a hallucinated citation id that was never part of the retrieved set", () => {
    const result = validateProjectAssistantAnswer(
      validPayload({ cited_source_ids: ["src-1", "invented-id-999"] }),
      VALID_IDS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.citedSourceIds).toEqual(["src-1"]);
    expect(result.data.citedSourceIds).not.toContain("invented-id-999");
    expect(result.warnings.some((w) => w.includes("invented-id-999"))).toBe(true);
  });

  it("rejects (does not blindly trust) an invalid answer_status value", () => {
    const result = validateProjectAssistantAnswer(validPayload({ answer_status: "very_confident" }), VALID_IDS);
    expect(result.ok).toBe(false);
  });

  it.each(["approved", "documented", "unresolved", "not_found"])(
    "accepts the exact allowed answer_status value '%s'",
    (status) => {
      const result = validateProjectAssistantAnswer(
        validPayload({ answer_status: status, cited_source_ids: status === "not_found" ? [] : ["src-1"] }),
        VALID_IDS
      );
      expect(result.ok).toBe(true);
    }
  );

  it("auto-corrects not_found with non-empty citations instead of hard-failing", () => {
    const result = validateProjectAssistantAnswer(
      validPayload({ answer_status: "not_found", cited_source_ids: ["src-1", "src-2"] }),
      VALID_IDS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answerStatus).toBe("not_found");
    expect(result.data.citedSourceIds).toEqual([]);
    expect(result.warnings.some((w) => w.includes("not_found"))).toBe(true);
  });

  it("rejects an empty response", () => {
    expect(validateProjectAssistantAnswer(null, VALID_IDS).ok).toBe(false);
    expect(validateProjectAssistantAnswer("", VALID_IDS).ok).toBe(false);
    expect(validateProjectAssistantAnswer("   ", VALID_IDS).ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(validateProjectAssistantAnswer("not json{", VALID_IDS).ok).toBe(false);
  });

  it("rejects a JSON array instead of an object", () => {
    expect(validateProjectAssistantAnswer("[]", VALID_IDS).ok).toBe(false);
  });

  it("rejects a missing/empty answer_text", () => {
    expect(validateProjectAssistantAnswer(validPayload({ answer_text: "" }), VALID_IDS).ok).toBe(false);
    expect(validateProjectAssistantAnswer(validPayload({ answer_text: undefined }), VALID_IDS).ok).toBe(false);
  });

  it("rejects a non-boolean conflict_explained", () => {
    expect(validateProjectAssistantAnswer(validPayload({ conflict_explained: "yes" }), VALID_IDS).ok).toBe(false);
  });

  it("rejects a non-array cited_source_ids", () => {
    expect(validateProjectAssistantAnswer(validPayload({ cited_source_ids: "src-1" }), VALID_IDS).ok).toBe(false);
  });
});
