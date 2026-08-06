import { describe, expect, it } from "vitest";
import { maskSecrets, maskFindingEvidence } from "./masking";

describe("maskSecrets", () => {
  it("يخفي Postgres Connection String اللي فيها يوزر:باسورد", () => {
    const text = 'const url = "postgres://myuser:supersecretpass@db.example.com:5432/mydb";';
    const masked = maskSecrets(text);
    expect(masked).not.toContain("supersecretpass");
    expect(masked).toContain("[MASKED]");
  });

  it("يخفي JWT (ثلاث أجزاء Base64URL)", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ_abcdefghij";
    const masked = maskSecrets(`const token = "${jwt}";`);
    expect(masked).not.toContain(jwt);
    expect(masked).toContain("[MASKED]");
  });

  it("يخفي مفتاح Gemini/Google (AIza...)", () => {
    const masked = maskSecrets('const key = "AIzaSyD1234567890abcdefghijklmnopqrstuv";');
    expect(masked).not.toContain("AIzaSyD1234567890abcdefghijklmnopqrstuv");
  });

  it("يخفي مفتاح GitHub (ghp_...)", () => {
    const masked = maskSecrets('GITHUB_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"');
    expect(masked).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyz");
  });

  it("يحافظ على النص العادي من غير أي أسرار زي ما هو", () => {
    const text = "function foo() { return 1 + 1; }";
    expect(maskSecrets(text)).toBe(text);
  });

  it("يخفي generic API_KEY=\"value\" مع الحفاظ على اسم المتغيّر", () => {
    const masked = maskSecrets('const api_key = "sk-abcdefghij1234567890";');
    expect(masked).toContain("api_key");
    expect(masked).not.toContain("sk-abcdefghij1234567890");
  });
});

describe("maskFindingEvidence", () => {
  it("يطبّق الإخفاء على code_snippet وdescription وimpact بس", () => {
    const finding = {
      code_snippet: 'const key = "AIzaSyD1234567890abcdefghijklmnopqrstuv";',
      description: "تم العثور على مفتاح في الملف",
      impact: "تسريب محتمل",
      root_cause: "مفتاح AIzaSyD1234567890abcdefghijklmnopqrstuv مكتوب حرفيًا",
      attack_scenario: "أي حد يشوف الكود يقدر ياخد المفتاح AIzaSyD1234567890abcdefghijklmnopqrstuv",
      recommended_fix: "انقل المفتاح لـ Environment Variable",
      patch_suggestion: 'const key = process.env.API_KEY; // كان AIzaSyD1234567890abcdefghijklmnopqrstuv',
    };
    const masked = maskFindingEvidence(finding);
    expect(masked.code_snippet).not.toContain("AIzaSyD1234567890abcdefghijklmnopqrstuv");
    expect(masked.root_cause).not.toContain("AIzaSyD1234567890abcdefghijklmnopqrstuv");
    expect(masked.attack_scenario).not.toContain("AIzaSyD1234567890abcdefghijklmnopqrstuv");
    expect(masked.patch_suggestion).not.toContain("AIzaSyD1234567890abcdefghijklmnopqrstuv");
  });
});
