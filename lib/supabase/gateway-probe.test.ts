import { describe, it, expect } from "vitest";
import { summarizeProbe } from "./gateway-probe";
import { checkSupabaseEnvConsistency } from "./env-check";

/**
 * الفحص ده اتكتب بعد عطل حقيقي: البوّابة ردّت بـ 401، وفحص اتساق البيئة
 * كان قايل "تمام". الاتنين صح مع بعض — المعرّفات كانت متطابقة والمفتاح
 * كان مرفوض. الاختبارات دي بتحرس التمييز ده.
 */

describe("summarizeProbe — رفض المفاتيح", () => {
  it("رفض المفتاحين بيشاور على تعطيل/تدوير المفاتيح", () => {
    const summary = summarizeProbe("rejected", "rejected");
    expect(summary).toContain("401");
    expect(summary).toContain("المفتاحين");
  });

  it("رفض مفتاح الخدمة لوحده بيسمّيه بالاسم", () => {
    const summary = summarizeProbe("accepted", "rejected");
    expect(summary).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(summary).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("رفض المفتاح العام لوحده بيسمّيه بالاسم", () => {
    const summary = summarizeProbe("rejected", "accepted");
    expect(summary).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("المفتاحين مقبولين = المشكلة مش في المصادقة", () => {
    const summary = summarizeProbe("accepted", "accepted");
    expect(summary).toContain("مش في المصادقة");
  });
});

describe("summarizeProbe — الأولويات", () => {
  it("عدم الوصول بيغلب الرفض", () => {
    // مفيش رد أصلًا معناه ماقدرناش نحكم على المفتاح — الحكم بالرفض هنا
    // هيوجّه المستخدم يغيّر مفتاح سليم.
    const summary = summarizeProbe("unreachable", "rejected");
    expect(summary).toContain("تعذّر الوصول");
  });

  it("غياب المفتاحين بيتقال صراحة", () => {
    expect(summarizeProbe("missing", "missing")).toContain("مش موجودة");
  });

  it("غياب مفتاح واحد بيتحدّد بالاسم", () => {
    expect(summarizeProbe("missing", "accepted")).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(summarizeProbe("accepted", "missing")).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("كل تركيبة بترجّع نص مفيد مش فاضي", () => {
    const verdicts = ["accepted", "rejected", "missing", "unreachable"] as const;
    for (const anon of verdicts) {
      for (const service of verdicts) {
        expect(summarizeProbe(anon, service).length).toBeGreaterThan(10);
      }
    }
  });
});

describe("checkSupabaseEnvConsistency — verified", () => {
  const jwt = (ref: string) =>
    `x.${Buffer.from(JSON.stringify({ ref })).toString("base64url")}.y`;

  it("مفاتيح بصيغة جديدة (مش JWT) = نجاح غير مُتحقَّق منه", () => {
    // ده الفخ: `ok: true` من غير ما يتقارن أي حاجة. لو المستدعي قرا `ok`
    // بس، هيفتكر إن المفاتيح اتفحصت وهي ماتفحصتش.
    const res = checkSupabaseEnvConsistency({
      url: "https://abcd.supabase.co",
      anonKey: "sb_publishable_xxx",
      serviceKey: "sb_secret_yyy",
    });
    expect(res.ok).toBe(true);
    expect(res.verified).toBe(false);
  });

  it("مفاتيح JWT متطابقة = نجاح مُتحقَّق منه", () => {
    const res = checkSupabaseEnvConsistency({
      url: "https://abcd.supabase.co",
      anonKey: jwt("abcd"),
      serviceKey: jwt("abcd"),
    });
    expect(res.ok).toBe(true);
    expect(res.verified).toBe(true);
  });

  it("تعارض المعرّفات = فشل مُتحقَّق منه", () => {
    const res = checkSupabaseEnvConsistency({
      url: "https://abcd.supabase.co",
      anonKey: jwt("wxyz"),
      serviceKey: jwt("abcd"),
    });
    expect(res.ok).toBe(false);
    expect(res.verified).toBe(true);
  });

  it("تطابق المعرّفات مايضمنش إن المفتاح صالح", () => {
    // الحقيقة اللي العطل كشفها: مفتاح اتعطّل أو اتغيّر بيحتفظ بنفس المعرّف
    // بالظبط، فبيعدّي الفحص ده وهو مرفوض من الخادم. التحقق من الصلاحية
    // محتاج سؤال البوّابة، مش تحليل نص المفتاح.
    const res = checkSupabaseEnvConsistency({
      url: "https://abcd.supabase.co",
      anonKey: jwt("abcd"),
      serviceKey: jwt("abcd"),
    });
    expect(res.ok).toBe(true);
    expect(res).not.toHaveProperty("keyValid");
  });
});
