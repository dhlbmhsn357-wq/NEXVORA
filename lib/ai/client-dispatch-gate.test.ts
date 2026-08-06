import { describe, it, expect, beforeEach } from "vitest";
import {
  canDispatchNow,
  beginDispatch,
  endDispatch,
  __resetDispatchGateForTests,
  GLOBAL_MIN_DISPATCH_INTERVAL_MS,
} from "./client-dispatch-gate";

describe("client-dispatch-gate (global AI dispatch pacer)", () => {
  beforeEach(() => __resetDispatchGateForTests());

  it("يسمح بالإطلاق الأول فورًا", () => {
    expect(canDispatchNow(1_000_000)).toBe(true);
  });

  it("يمنع إطلاق تانٍ وفيه إطلاق طائر (inFlight) مهما عدّى الوقت", () => {
    beginDispatch(1_000_000);
    expect(canDispatchNow(1_000_000 + GLOBAL_MIN_DISPATCH_INTERVAL_MS + 5_000)).toBe(false);
  });

  it("يمنع الإطلاق قبل مرور الحد الأدنى حتى بعد قفل الإطلاق السابق", () => {
    beginDispatch(1_000_000);
    endDispatch();
    expect(canDispatchNow(1_000_000 + GLOBAL_MIN_DISPATCH_INTERVAL_MS - 1)).toBe(false);
  });

  it("يسمح بالإطلاق التالي بعد مرور الحد الأدنى وقفل السابق", () => {
    beginDispatch(1_000_000);
    endDispatch();
    expect(canDispatchNow(1_000_000 + GLOBAL_MIN_DISPATCH_INTERVAL_MS)).toBe(true);
  });

  it("الحالة مشتركة (Singleton) — إطلاق من مكان يمنع إطلاق فوري من مكان تانٍ", () => {
    // يحاكي لوحتين مختلفتين بيستدعوا نفس الـ module.
    expect(canDispatchNow(2_000_000)).toBe(true);
    beginDispatch(2_000_000);
    endDispatch();
    // لوحة تانية بتحاول فورًا بعد اللي فاتت — مرفوض لحد ما الفترة تعدّي.
    expect(canDispatchNow(2_000_000 + 500)).toBe(false);
    expect(canDispatchNow(2_000_000 + GLOBAL_MIN_DISPATCH_INTERVAL_MS)).toBe(true);
  });
});
