import { describe, expect, it } from "vitest";
import { isFileRelevantToCodeQualityCategory, isCategoryRelevantToChangedFiles } from "./relevance";

describe("isFileRelevantToCodeQualityCategory", () => {
  it("readability مرتبط دايمًا بأي ملف كود", () => {
    expect(isFileRelevantToCodeQualityCategory("readability", "app/page.tsx")).toBe(true);
  });

  it("testing_coverage مرتبط دايمًا بأي ملف (إنتاج أو اختبار)", () => {
    expect(isFileRelevantToCodeQualityCategory("testing_coverage", "lib/security-review/generation-service.ts")).toBe(true);
    expect(isFileRelevantToCodeQualityCategory("testing_coverage", "lib/security-review/generation-service.test.ts")).toBe(true);
  });

  it("complexity مرتبط دايمًا بأي ملف كود", () => {
    expect(isFileRelevantToCodeQualityCategory("complexity", "components/ui/Button.tsx")).toBe(true);
  });
});

describe("isCategoryRelevantToChangedFiles", () => {
  it("يرجّع true لأي ملف متغيّر (كل المحاور عامة)", () => {
    expect(isCategoryRelevantToChangedFiles("duplication", ["app/page.tsx"])).toBe(true);
  });

  it("يرجّع false لو مفيش ملفات متغيّرة خالص", () => {
    expect(isCategoryRelevantToChangedFiles("duplication", [])).toBe(false);
  });
});
