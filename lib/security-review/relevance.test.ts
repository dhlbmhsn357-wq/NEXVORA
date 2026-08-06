import { describe, expect, it } from "vitest";
import { isFileRelevantToSecurityCategory, isCategoryRelevantToChangedFiles } from "./relevance";

describe("isFileRelevantToSecurityCategory", () => {
  it("authentication بيهتم بملفات auth/session/middleware", () => {
    expect(isFileRelevantToSecurityCategory("authentication", "lib/auth/rbac.ts")).toBe(true);
    expect(isFileRelevantToSecurityCategory("authentication", "middleware.ts")).toBe(true);
    expect(isFileRelevantToSecurityCategory("authentication", "components/ui/Button.tsx")).toBe(false);
  });

  it("rls بيهتم بملفات migrations/.sql", () => {
    expect(isFileRelevantToSecurityCategory("rls", "supabase/migrations/0038_x.sql")).toBe(true);
    expect(isFileRelevantToSecurityCategory("rls", "app/page.tsx")).toBe(false);
  });

  it("secrets مرتبط دايمًا بأي ملف (مفيش نمط استثناء)", () => {
    expect(isFileRelevantToSecurityCategory("secrets", "components/ui/Button.tsx")).toBe(true);
    expect(isFileRelevantToSecurityCategory("secrets", "random/path.ts")).toBe(true);
  });

  it("environment بيهتم بملفات .env/config", () => {
    expect(isFileRelevantToSecurityCategory("environment", "next.config.ts")).toBe(true);
    expect(isFileRelevantToSecurityCategory("environment", "app/page.tsx")).toBe(false);
  });
});

describe("isCategoryRelevantToChangedFiles", () => {
  it("يرجّع true لو ملف واحد بس من المتغيّرين مرتبط بالمحور", () => {
    expect(isCategoryRelevantToChangedFiles("authentication", ["components/ui/Button.tsx", "lib/auth/session.ts"])).toBe(true);
  });

  it("يرجّع false لو مفيش أي ملف متغيّر مرتبط بالمحور", () => {
    expect(isCategoryRelevantToChangedFiles("authentication", ["components/ui/Button.tsx", "app/page.tsx"])).toBe(false);
  });

  it("يرجّع false لمصفوفة فاضية", () => {
    expect(isCategoryRelevantToChangedFiles("authentication", [])).toBe(false);
  });
});
