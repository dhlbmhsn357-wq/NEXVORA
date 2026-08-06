import { describe, expect, it } from "vitest";
import { versionInfoFromUpstream } from "./helpers";

describe("versionInfoFromUpstream", () => {
  it("لو نسخة المصدر وقت التوليد أقل من نسخة المصدر الحالية → isStale=true", () => {
    const info = versionInfoFromUpstream("projectBrain", 2, 3, 5, "2026-01-01");
    expect(info.isStale).toBe(true);
    expect(info.staleReason).toBeTruthy();
  });

  it("لو النسختين متساويين → isStale=false", () => {
    const info = versionInfoFromUpstream("projectBrain", 3, 3, 5, "2026-01-01");
    expect(info.isStale).toBe(false);
  });

  it("لو المرحلة نفسها لسه ماتولّدتش (ownVersion=0) → isStale=false برغم اختلاف النسخ", () => {
    const info = versionInfoFromUpstream("projectBrain", 2, 3, 0, null);
    expect(info.isStale).toBe(false);
  });

  it("لو مفيش نسخة مصدر معروفة (null) → isStale=false", () => {
    const info = versionInfoFromUpstream("projectBrain", null, 3, 5, "2026-01-01");
    expect(info.isStale).toBe(false);
  });
});
