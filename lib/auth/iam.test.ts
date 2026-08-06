import { describe, it, expect } from "vitest";
import { roleSatisfies, requiredTier, ROLE_TIER, isStatusAllowed, statusBlockMessage } from "./roles";
import { validatePasswordStrength, PASSWORD_MIN_LENGTH } from "./password-policy";
import { evaluateLoginAttempt, MAX_FAILED_ATTEMPTS, MAX_ATTEMPTS_PER_WINDOW } from "./lockout";

describe("roles hierarchy (Enterprise IAM)", () => {
  it("الترتيب الهرمي: owner > admin > supervisor > member", () => {
    expect(ROLE_TIER.owner).toBeGreaterThan(ROLE_TIER.admin);
    expect(ROLE_TIER.admin).toBeGreaterThan(ROLE_TIER.supervisor);
    expect(ROLE_TIER.supervisor).toBeGreaterThan(ROLE_TIER.member);
  });

  it("النداءات القديمة ['owner','admin'] بترفض supervisor/member وبتقبل owner/admin", () => {
    expect(roleSatisfies("owner", ["owner", "admin"])).toBe(true);
    expect(roleSatisfies("admin", ["owner", "admin"])).toBe(true);
    expect(roleSatisfies("supervisor", ["owner", "admin"])).toBe(false);
    expect(roleSatisfies("member", ["owner", "admin"])).toBe(false);
  });

  it("النداءات القديمة ['owner','admin','member'] بتقبل الكل — supervisor بيندمج تلقائيًا", () => {
    expect(roleSatisfies("supervisor", ["owner", "admin", "member"])).toBe(true);
    expect(roleSatisfies("member", ["owner", "admin", "member"])).toBe(true);
  });

  it("مصفوفة فاضية = owner فقط (أعلى رتبة)", () => {
    expect(requiredTier([])).toBe(ROLE_TIER.owner);
    expect(roleSatisfies("admin", [])).toBe(false);
    expect(roleSatisfies("owner", [])).toBe(true);
  });

  it("الحالة: active فقط مسموحة، والباقي برسائل واضحة", () => {
    expect(isStatusAllowed("active")).toBe(true);
    for (const s of ["inactive", "locked", "suspended", "pending", "deleted"] as const) {
      expect(isStatusAllowed(s)).toBe(false);
      expect(statusBlockMessage(s).length).toBeGreaterThan(5);
    }
  });
});

describe("password policy", () => {
  it("يقبل كلمة مرور قوية", () => {
    expect(validatePasswordStrength("Str0ngPassword").ok).toBe(true);
  });

  it("يرفض القصيرة وناقصة الأصناف", () => {
    expect(validatePasswordStrength("short").ok).toBe(false);
    expect(validatePasswordStrength("a".repeat(PASSWORD_MIN_LENGTH)).ok).toBe(false); // لا كبير ولا رقم
    expect(validatePasswordStrength("ALLUPPERCASE1").ok).toBe(false); // لا صغير
    expect(validatePasswordStrength("alllowercase1").ok).toBe(false); // لا كبير
    expect(validatePasswordStrength("NoDigitsHere").ok).toBe(false); // لا رقم
  });

  it("يرفض المسافات في الأطراف", () => {
    expect(validatePasswordStrength(" Str0ngPassword").ok).toBe(false);
  });
});

describe("lockout / rate limiting", () => {
  it("يسمح بالمحاولات الأولى", () => {
    const d = evaluateLoginAttempt(0, 0);
    expect(d.blocked).toBe(false);
    expect(d.shouldLockAfterFailure).toBe(false);
  });

  it("الفشل قبل الأخير بيعلّم إن الفشل الجاي يقفل", () => {
    const d = evaluateLoginAttempt(MAX_FAILED_ATTEMPTS - 1, MAX_FAILED_ATTEMPTS - 1);
    expect(d.blocked).toBe(false);
    expect(d.shouldLockAfterFailure).toBe(true);
  });

  it("بعد بلوغ حد الفشل: مرفوض", () => {
    const d = evaluateLoginAttempt(MAX_FAILED_ATTEMPTS, MAX_FAILED_ATTEMPTS);
    expect(d.blocked).toBe(true);
  });

  it("throttle عام: محاولات كتير حتى لو ناجحة = مرفوض مؤقتًا", () => {
    const d = evaluateLoginAttempt(MAX_ATTEMPTS_PER_WINDOW, 0);
    expect(d.blocked).toBe(true);
  });
});
