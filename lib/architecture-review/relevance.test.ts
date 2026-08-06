import { describe, expect, it } from "vitest";
import { isFileRelevantToArchitectureCategory, isCategoryRelevantToChangedFiles } from "./relevance";

describe("isFileRelevantToArchitectureCategory", () => {
  it("layering مرتبط دايمًا بأي ملف (فصل الطبقات ممكن يُنتهك في أي مكان)", () => {
    expect(isFileRelevantToArchitectureCategory("layering", "app/page.tsx")).toBe(true);
  });

  it("module_boundaries بيهتم بملفات lib/ وapp/ بس", () => {
    expect(isFileRelevantToArchitectureCategory("module_boundaries", "lib/security-review/prompts.ts")).toBe(true);
    expect(isFileRelevantToArchitectureCategory("module_boundaries", "README.md")).toBe(false);
  });

  it("api_design بيهتم بملفات route/actions/api", () => {
    expect(isFileRelevantToArchitectureCategory("api_design", "app/api/search/route.ts")).toBe(true);
    expect(isFileRelevantToArchitectureCategory("api_design", "components/ui/Badge.tsx")).toBe(false);
  });

  it("dependency_management بيهتم بـ package.json أو أي import/require", () => {
    expect(isFileRelevantToArchitectureCategory("dependency_management", "package.json")).toBe(true);
  });
});

describe("isCategoryRelevantToChangedFiles", () => {
  it("يرجّع false لو مفيش ملف API متغيّر لمحور api_design", () => {
    expect(isCategoryRelevantToChangedFiles("api_design", ["components/ui/Badge.tsx", "README.md"])).toBe(false);
  });

  it("يرجّع true لو فيه ملف route.ts من ضمن المتغيّرين", () => {
    expect(isCategoryRelevantToChangedFiles("api_design", ["components/ui/Badge.tsx", "app/api/search/route.ts"])).toBe(true);
  });
});
