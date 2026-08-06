import { describe, it, expect } from "vitest";
import { validateAccessCredentialsRef } from "./credentials-guard";

describe("validateAccessCredentialsRef", () => {
  it("يقبل قيمة فارغة", () => {
    expect(validateAccessCredentialsRef("").ok).toBe(true);
    expect(validateAccessCredentialsRef(null).ok).toBe(true);
    expect(validateAccessCredentialsRef(undefined).ok).toBe(true);
  });

  it("يقبل مرجع نصي عادي", () => {
    expect(validateAccessCredentialsRef("see 1Password vault Q4").ok).toBe(true);
    expect(validateAccessCredentialsRef("Ask team lead for access").ok).toBe(true);
  });

  it("يرفض OpenAI-style key", () => {
    expect(validateAccessCredentialsRef("sk-abcd1234567890abcdef").ok).toBe(false);
  });

  it("يرفض AWS Access Key ID", () => {
    expect(validateAccessCredentialsRef("AKIAIOSFODNN7EXAMPLE").ok).toBe(false);
  });

  it("يرفض Bearer token", () => {
    expect(validateAccessCredentialsRef("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9").ok).toBe(false);
  });

  it("يرفض private key header", () => {
    expect(validateAccessCredentialsRef("-----BEGIN RSA PRIVATE KEY-----").ok).toBe(false);
  });

  it("يرفض password=... pattern", () => {
    expect(validateAccessCredentialsRef("db password=hunter2xyz").ok).toBe(false);
  });

  it("يرفض hex string طويل يشبه hash", () => {
    expect(validateAccessCredentialsRef("d41d8cd98f00b204e9800998ecf8427e").ok).toBe(false);
  });
});
