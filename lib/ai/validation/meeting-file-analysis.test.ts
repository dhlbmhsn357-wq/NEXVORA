import { describe, expect, it } from "vitest";
import { validateMeetingFileAnalysis } from "./meeting-file-analysis";

describe("validateMeetingFileAnalysis", () => {
  it("يرفض رد فارغ", () => {
    expect(validateMeetingFileAnalysis(null).ok).toBe(false);
  });

  it("يرفض لو summary فاضي", () => {
    const result = validateMeetingFileAnalysis(JSON.stringify({ summary: "", confidence: 80, entities: [] }));
    expect(result.ok).toBe(false);
  });

  it("يقبل رد صحيح", () => {
    const result = validateMeetingFileAnalysis(JSON.stringify({ summary: "ملخص المرفق", confidence: 75, entities: ["وحدة الدفع"] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toBe("ملخص المرفق");
      expect(result.data.entities).toEqual(["وحدة الدفع"]);
    }
  });

  it("entities غير موجودة ترجع مصفوفة فاضية بدل رفض الرد", () => {
    const result = validateMeetingFileAnalysis(JSON.stringify({ summary: "ملخص", confidence: 60 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.entities).toEqual([]);
  });
});
