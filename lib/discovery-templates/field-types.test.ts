import { describe, expect, it } from "vitest";
import { formatAnswerValue, getQuestionTypeMeta } from "./field-types";

describe("formatAnswerValue", () => {
  it("yes_no يُصاغ نعم/لا", () => {
    expect(formatAnswerValue(true, "yes_no")).toBe("نعم");
    expect(formatAnswerValue(false, "yes_no")).toBe("لا");
    expect(formatAnswerValue(undefined, "yes_no")).toBeNull();
  });

  it("rating يُصاغ X/5 ويتخطى الصفر", () => {
    expect(formatAnswerValue(4, "rating")).toBe("4/5");
    expect(formatAnswerValue(0, "rating")).toBeNull();
  });

  it("checkbox (مصفوفة) يتجمّع بفواصل", () => {
    expect(formatAnswerValue(["أ", "ب"], "checkbox")).toBe("أ، ب");
    expect(formatAnswerValue([], "checkbox")).toBeNull();
  });

  it("ملف مرفوع يُظهر الاسم", () => {
    const file = { path: "p", name: "brief.pdf", size: 10, type: "application/pdf" };
    expect(formatAnswerValue(file, "file_upload")).toBe("brief.pdf");
    expect(formatAnswerValue(null, "file_upload")).toBeNull();
  });

  it("نص عادي يُقصّ ويتحقق من الفراغ", () => {
    expect(formatAnswerValue("  تجارة  ", "short_text")).toBe("تجارة");
    expect(formatAnswerValue("   ", "short_text")).toBeNull();
  });
});

describe("getQuestionTypeMeta", () => {
  it("يحدد أنواع الرفع والاختيار بشكل صحيح", () => {
    expect(getQuestionTypeMeta("logo_upload").isUpload).toBe(true);
    expect(getQuestionTypeMeta("checkbox").isMulti).toBe(true);
    expect(getQuestionTypeMeta("multiple_choice").hasOptions).toBe(true);
    expect(getQuestionTypeMeta("short_text").isUpload).toBe(false);
  });
});
