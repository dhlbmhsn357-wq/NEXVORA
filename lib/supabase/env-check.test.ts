import { describe, it, expect } from "vitest";
import {
  extractProjectRefFromUrl,
  extractProjectRefFromJwt,
  checkSupabaseEnvConsistency,
} from "./env-check";

// JWT بسيط (header.payload.signature) — payload فيه ref. مش موقّع فعليًا،
// إحنا بنقرأ الـ payload بس.
function makeKey(ref: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ ref, role: "anon" })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("env-check (pure)", () => {
  it("extracts project ref from a supabase url", () => {
    expect(extractProjectRefFromUrl("https://abcdefgh.supabase.co")).toBe("abcdefgh");
    expect(extractProjectRefFromUrl("https://abcdefgh.supabase.co/rest/v1")).toBe("abcdefgh");
    expect(extractProjectRefFromUrl("http://localhost:54321")).toBeNull();
    expect(extractProjectRefFromUrl(null)).toBeNull();
  });

  it("extracts ref claim from a JWT key", () => {
    expect(extractProjectRefFromJwt(makeKey("proj123"))).toBe("proj123");
    expect(extractProjectRefFromJwt("not-a-jwt")).toBeNull();
    expect(extractProjectRefFromJwt(null)).toBeNull();
  });

  it("passes when all refs match", () => {
    const res = checkSupabaseEnvConsistency({
      url: "https://sameproj.supabase.co",
      anonKey: makeKey("sameproj"),
      serviceKey: makeKey("sameproj"),
    });
    expect(res.ok).toBe(true);
  });

  it("fails loudly when anon and service keys are different projects", () => {
    const res = checkSupabaseEnvConsistency({
      url: "https://projectA.supabase.co",
      anonKey: makeKey("projectA"),
      serviceKey: makeKey("projectB"),
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBeTruthy();
  });

  it("is tolerant when only one ref is parseable (new-format keys)", () => {
    const res = checkSupabaseEnvConsistency({
      url: "https://onlyurl.supabase.co",
      anonKey: "sb_publishable_xxx",
      serviceKey: "sb_secret_yyy",
    });
    expect(res.ok).toBe(true);
  });
});
