import { describe, it, expect } from "vitest";
import { extractClientIp } from "./rate-limiter";

describe("extractClientIp", () => {
  it("يستخرج أول IP من x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(extractClientIp(headers)).toBe("203.0.113.1");
  });

  it("يستخدم x-real-ip لو x-forwarded-for مش موجود", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.5" });
    expect(extractClientIp(headers)).toBe("198.51.100.5");
  });

  it("يفضّل x-forwarded-for على x-real-ip لو الاتنين موجودين", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.1",
      "x-real-ip": "198.51.100.5",
    });
    expect(extractClientIp(headers)).toBe("203.0.113.1");
  });

  it("يرجّع unknown لو مفيش أي ترويسة", () => {
    expect(extractClientIp(new Headers())).toBe("unknown");
  });

  it("يشيل المسافات الزيادة من IP", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.1  , 10.0.0.1" });
    expect(extractClientIp(headers)).toBe("203.0.113.1");
  });
});
