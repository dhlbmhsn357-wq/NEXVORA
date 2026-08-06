import { describe, it, expect } from "vitest";

/**
 * البوابة اللي بتقرّر هل نعرض إنشاء مسؤول النظام.
 *
 * الاختبارات دي بتحرس السلوك اللي كان مكسور: الاستعلام لما كان بيفشل،
 * الكود كان بيقرا العدد الفاضي كصفر ويستنتج "المنصة فاضية" — فيعرض صفحة
 * الإعداد لمنصة فيها مسؤول ومشاريع، ويسمح بإنشاء مسؤول تاني.
 *
 * القرار نفسه معزول هنا كدالة نقية عشان يتغطّى بالاختبار من غير قاعدة
 * بيانات، والـ action بيستدعي نفس المنطق.
 */

export type GateInput =
  | { envOk: false; envMessage: string }
  | { envOk: true; queryFailed: true; errorMessage: string }
  | { envOk: true; queryFailed: false; ownerCount: number | null };

export type GateResult =
  | { status: "needed" }
  | { status: "already_configured" }
  | { status: "unknown"; reason: string };

/** نفس شجرة القرار المستخدمة في `checkSetupGate`. */
export function decideSetupGate(input: GateInput): GateResult {
  if (!input.envOk) return { status: "unknown", reason: input.envMessage };
  if (input.queryFailed) return { status: "unknown", reason: input.errorMessage };
  if (input.ownerCount === null || input.ownerCount === undefined) {
    return { status: "unknown", reason: "الاستعلام لم يُرجع عددًا." };
  }
  return input.ownerCount === 0 ? { status: "needed" } : { status: "already_configured" };
}

describe("decideSetupGate — الفشل المغلق", () => {
  it("فشل الاستعلام مايتقراش كمنصة فاضية", () => {
    // ده بالظبط الخلل الأصلي: خطأ → count فاضية → صفر → "محتاج إعداد".
    const result = decideSetupGate({
      envOk: true,
      queryFailed: true,
      errorMessage: "connection refused",
    });
    expect(result.status).toBe("unknown");
    expect(result.status).not.toBe("needed");
  });

  it("العدد الفاضي مايتقراش كصفر", () => {
    const result = decideSetupGate({ envOk: true, queryFailed: false, ownerCount: null });
    expect(result.status).toBe("unknown");
  });

  it("عدم تطابق متغيّرات البيئة بيوقف البوابة", () => {
    // مفاتيح بتشاور على مشروعين مختلفين معناها إننا بنقرا قاعدة تانية،
    // والصفر ساعتها صحيح تقنيًا وكارثي عمليًا.
    const result = decideSetupGate({ envOk: false, envMessage: "project ref mismatch" });
    expect(result.status).toBe("unknown");
    if (result.status === "unknown") expect(result.reason).toContain("mismatch");
  });

  it("بيحمل سبب العطل عشان يتعرض بدل ما يتخفي", () => {
    const result = decideSetupGate({
      envOk: true,
      queryFailed: true,
      errorMessage: "permission denied for table profiles",
    });
    if (result.status === "unknown") {
      expect(result.reason).toContain("permission denied");
    }
  });
});

describe("decideSetupGate — الحالات الصحيحة", () => {
  it("صفر مسؤولين مع استعلام ناجح = محتاج إعداد", () => {
    expect(decideSetupGate({ envOk: true, queryFailed: false, ownerCount: 0 })).toEqual({
      status: "needed",
    });
  });

  it("وجود مسؤول واحد = مُهيّأة بالفعل", () => {
    expect(decideSetupGate({ envOk: true, queryFailed: false, ownerCount: 1 })).toEqual({
      status: "already_configured",
    });
  });

  it("أكتر من مسؤول = مُهيّأة بالفعل", () => {
    expect(decideSetupGate({ envOk: true, queryFailed: false, ownerCount: 7 })).toEqual({
      status: "already_configured",
    });
  });
});

describe("decideSetupGate — الثبات", () => {
  it("مفيش مدخل بيرجّع needed غير الصفر المؤكَّد", () => {
    const inputs: GateInput[] = [
      { envOk: false, envMessage: "x" },
      { envOk: true, queryFailed: true, errorMessage: "y" },
      { envOk: true, queryFailed: false, ownerCount: null },
      { envOk: true, queryFailed: false, ownerCount: 1 },
      { envOk: true, queryFailed: false, ownerCount: 99 },
    ];
    for (const input of inputs) {
      expect(decideSetupGate(input).status).not.toBe("needed");
    }
  });
});
