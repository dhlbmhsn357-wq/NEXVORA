import { describe, expect, it } from "vitest";
import { isFileRelevantToDatabaseCategory, isCategoryRelevantToChangedFiles, isFileContentRelevantToQueryCategory } from "./relevance";

describe("isFileRelevantToDatabaseCategory", () => {
  it("migration بيهتم بملفات مجلد migrations بس", () => {
    expect(isFileRelevantToDatabaseCategory("migration", "supabase/migrations/0038_x.sql")).toBe(true);
    expect(isFileRelevantToDatabaseCategory("migration", "lib/db/client.ts")).toBe(false);
  });

  it("query مرتبط دايمًا بأي ملف (استعلامات ممكن تكون في أي مكان)", () => {
    expect(isFileRelevantToDatabaseCategory("query", "app/page.tsx")).toBe(true);
  });

  it("storage بيهتم بملفات storage/upload/bucket", () => {
    expect(isFileRelevantToDatabaseCategory("storage", "lib/storage/upload.ts")).toBe(true);
    expect(isFileRelevantToDatabaseCategory("storage", "app/page.tsx")).toBe(false);
  });

  it("logging بيهتم بملفات فيها console/logger", () => {
    expect(isFileRelevantToDatabaseCategory("logging", "lib/logger.ts")).toBe(true);
    expect(isFileRelevantToDatabaseCategory("logging", "components/ui/Button.tsx")).toBe(false);
  });
});

describe("isFileContentRelevantToQueryCategory", () => {
  it("يرجّع true لو الملف فيه استدعاء .from( فعلي (Supabase Query Builder)", () => {
    expect(isFileContentRelevantToQueryCategory('await supabase.from("projects").select("*")')).toBe(true);
  });

  it("يرجّع true لو الملف فيه .rpc( أو createServiceClient", () => {
    expect(isFileContentRelevantToQueryCategory("const supabase = createServiceClient();")).toBe(true);
    expect(isFileContentRelevantToQueryCategory('await supabase.rpc("some_function")')).toBe(true);
  });

  it("يرجّع false لملف مفيهوش أي استعلام قاعدة بيانات", () => {
    expect(isFileContentRelevantToQueryCategory("export function add(a: number, b: number) { return a + b; }")).toBe(false);
  });
});

describe("isCategoryRelevantToChangedFiles", () => {
  it("يرجّع false لو مفيش ملف migrations اتغيّر لمحور migration", () => {
    expect(isCategoryRelevantToChangedFiles("migration", ["app/page.tsx", "lib/db.ts"])).toBe(false);
  });

  it("يرجّع true لو فيه ملف migrations من ضمن المتغيّرين", () => {
    expect(isCategoryRelevantToChangedFiles("migration", ["app/page.tsx", "supabase/migrations/0038_x.sql"])).toBe(true);
  });
});
