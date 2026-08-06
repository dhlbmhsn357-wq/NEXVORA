import { describe, expect, it } from "vitest";
import { isFileRelevantToPerformanceCategory, isCategoryRelevantToChangedFiles } from "./relevance";

describe("isFileRelevantToPerformanceCategory", () => {
  it("query_performance مرتبط دايمًا بأي ملف (استعلامات ممكن تكون في أي مكان)", () => {
    expect(isFileRelevantToPerformanceCategory("query_performance", "app/page.tsx")).toBe(true);
  });

  it("render_performance بيهتم بملفات .tsx بس", () => {
    expect(isFileRelevantToPerformanceCategory("render_performance", "components/ui/Button.tsx")).toBe(true);
    expect(isFileRelevantToPerformanceCategory("render_performance", "lib/security-review/generation-service.ts")).toBe(false);
  });

  it("bundle_size بيهتم بملفات .ts/.tsx", () => {
    expect(isFileRelevantToPerformanceCategory("bundle_size", "components/ui/Button.tsx")).toBe(true);
    expect(isFileRelevantToPerformanceCategory("bundle_size", "README.md")).toBe(false);
  });

  it("caching مرتبط دايمًا بأي ملف (إعدادات التخزين المؤقت ممكن تكون في أي مكان)", () => {
    expect(isFileRelevantToPerformanceCategory("caching", "app/page.tsx")).toBe(true);
  });
});

describe("isCategoryRelevantToChangedFiles", () => {
  it("يرجّع false لو مفيش ملف .tsx متغيّر لمحور render_performance", () => {
    expect(isCategoryRelevantToChangedFiles("render_performance", ["lib/db.ts", "README.md"])).toBe(false);
  });

  it("يرجّع true لو فيه ملف .tsx من ضمن المتغيّرين", () => {
    expect(isCategoryRelevantToChangedFiles("render_performance", ["lib/db.ts", "components/ui/Button.tsx"])).toBe(true);
  });
});
