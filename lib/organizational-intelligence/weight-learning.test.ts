import { describe, expect, it } from "vitest";
import { applyWeightNudge, computeWeightNudge } from "./weight-learning";

describe("computeWeightNudge", () => {
  it("accepted → +1", () => {
    expect(computeWeightNudge("accepted")).toBe(1);
  });

  it("dismissed → -1", () => {
    expect(computeWeightNudge("dismissed")).toBe(-1);
  });

  it("suggested/postponed/needs_discussion → null (مفيش حكم نهائي)", () => {
    expect(computeWeightNudge("suggested")).toBeNull();
    expect(computeWeightNudge("postponed")).toBeNull();
    expect(computeWeightNudge("needs_discussion")).toBeNull();
  });
});

describe("applyWeightNudge", () => {
  it("+1 يزوّد الوزن بـ 5", () => {
    expect(applyWeightNudge(50, 1)).toBe(55);
  });

  it("-1 ينقص الوزن بـ 5", () => {
    expect(applyWeightNudge(50, -1)).toBe(45);
  });

  it("مقصوص عند 100 (سقف)", () => {
    expect(applyWeightNudge(98, 1)).toBe(100);
  });

  it("مقصوص عند صفر (أرضية)", () => {
    expect(applyWeightNudge(2, -1)).toBe(0);
  });
});
