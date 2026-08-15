import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { validateProspectConversionEligibility, buildConversionNotes } from "./conversion-service";

describe("validateProspectConversionEligibility", () => {
  const base = {
    organizationName: "مدرسة النور",
    primaryPhoneNormalized: "201012345678",
    email: null as string | null,
    isOwnerOrAdmin: false,
  };

  it("interested + بيانات صالحة → مسموح", () => {
    const r = validateProspectConversionEligibility({ ...base, status: "interested" });
    expect(r.ok).toBe(true);
  });

  it("غير interested وبدون صلاحية owner/admin → مرفوض", () => {
    const r = validateProspectConversionEligibility({ ...base, status: "replied" });
    expect(r.ok).toBe(false);
  });

  it("غير interested لكن owner/admin مع overrideReason → مسموح", () => {
    const r = validateProspectConversionEligibility({
      ...base,
      status: "new",
      isOwnerOrAdmin: true,
      overrideReason: "طلب عميل مباشر عبر مكالمة",
    });
    expect(r.ok).toBe(true);
  });

  it("owner/admin بدون overrideReason → مرفوض", () => {
    const r = validateProspectConversionEligibility({ ...base, status: "new", isOwnerOrAdmin: true });
    expect(r.ok).toBe(false);
  });

  it("بدون اسم منظمة → مرفوض", () => {
    const r = validateProspectConversionEligibility({ ...base, status: "interested", organizationName: "  " });
    expect(r.ok).toBe(false);
  });

  it("بدون هاتف ولا بريد → مرفوض", () => {
    const r = validateProspectConversionEligibility({
      ...base,
      status: "interested",
      primaryPhoneNormalized: null,
      email: null,
    });
    expect(r.ok).toBe(false);
  });

  it("بريد فقط بدون هاتف → مسموح (وسيلة تواصل واحدة تكفي)", () => {
    const r = validateProspectConversionEligibility({
      ...base,
      status: "interested",
      primaryPhoneNormalized: null,
      email: "x@y.com",
    });
    expect(r.ok).toBe(true);
  });
});

describe("buildConversionNotes", () => {
  it("يدمج كل الحقول المتاحة في نص واحد منظم", () => {
    const notes = buildConversionNotes({
      organizationName: "مدرسة النور",
      sector: "تعليم",
      governorate: "القاهرة",
      cityOrArea: "مدينة نصر",
      websiteUrl: "https://nour.example",
      painHypothesis: "صعوبة تتبع التسجيل",
      suggestedOffer: "نظام تسجيل موحّد",
      notes: "تواصل أولي عبر الهاتف",
    });
    expect(notes).toContain("مدرسة النور");
    expect(notes).toContain("تعليم");
    expect(notes).toContain("القاهرة / مدينة نصر");
    expect(notes).toContain("nour.example");
    expect(notes).toContain("صعوبة تتبع التسجيل");
    expect(notes).toContain("نظام تسجيل موحّد");
    expect(notes).toContain("تواصل أولي عبر الهاتف");
  });

  it("يتجاهل الحقول الفارغة بدون أسطر فارغة زائدة", () => {
    const notes = buildConversionNotes({
      organizationName: "جهة",
      sector: null,
      governorate: null,
      cityOrArea: null,
      websiteUrl: null,
      painHypothesis: null,
      suggestedOffer: null,
      notes: null,
    });
    expect(notes.split("\n")).toHaveLength(1);
  });
});
