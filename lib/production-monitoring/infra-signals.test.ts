import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRailwaySignal, getVercelSignal } from "./infra-signals";

const ORIGINAL_ENV = { ...process.env };

describe("infra-signals graceful fallback (no fabricated data)", () => {
  beforeEach(() => {
    delete process.env.RAILWAY_API_TOKEN;
    delete process.env.VERCEL_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("Railway بلا Token → not_configured صراحةً، مش رقم ملفّق", async () => {
    const signal = await getRailwaySignal();
    expect(signal).toEqual({
      service: "railway",
      configured: false,
      status: "not_configured",
      detail: { message: "أضف RAILWAY_API_TOKEN لتفعيل المراقبة الحقيقية." },
    });
  });

  it("Vercel بلا Token → not_configured صراحةً، مش رقم ملفّق", async () => {
    const signal = await getVercelSignal();
    expect(signal).toEqual({
      service: "vercel",
      configured: false,
      status: "not_configured",
      detail: { message: "أضف VERCEL_API_TOKEN لتفعيل المراقبة الحقيقية." },
    });
  });
});
