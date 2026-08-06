import { describe, expect, it } from "vitest";
import {
  classifyDomain,
  computeConfidence,
  experienceTypeLabel,
  isExperienceType,
  isReusable,
  usageAdjustment,
} from "./experience-model";
import { discoverPatterns, type ObservationFragment } from "./pattern-discovery";
import { isSafeForLibrary, sanitizeExperience } from "./sanitize";
import { buildLessonsReport, type LessonSignal } from "./lessons";

// ============================================================
// experience-model
// ============================================================

describe("experience-model", () => {
  it("التسمية والحرّاس", () => {
    expect(experienceTypeLabel("success_pattern")).toBe("نمط نجاح");
    expect(isExperienceType("lesson_learned")).toBe(true);
    expect(isExperienceType("nonsense")).toBe(false);
    expect(isReusable("reusable_workflow")).toBe(true);
    expect(isReusable("success_pattern")).toBe(false);
  });

  describe("computeConfidence", () => {
    it("الثقة تنمو مع عدد المشاريع", () => {
      const few = computeConfidence({ projectCount: 1, quality: 60, humanApproved: false });
      const many = computeConfidence({ projectCount: 30, quality: 60, humanApproved: false });
      expect(many).toBeGreaterThan(few);
    });
    it("المراجعة البشرية ترفع الأرضية", () => {
      const raw = computeConfidence({ projectCount: 0, quality: 0, humanApproved: false });
      const approved = computeConfidence({ projectCount: 0, quality: 0, humanApproved: true });
      expect(approved).toBeGreaterThanOrEqual(55);
      expect(approved).toBeGreaterThan(raw);
    });
    it("محصورة ٠–١٠٠", () => {
      const c = computeConfidence({ projectCount: 1000, quality: 100, humanApproved: true });
      expect(c).toBeLessThanOrEqual(100);
    });
  });

  describe("usageAdjustment", () => {
    it("الاستخدام المتراكم يرفع الثقة", () => {
      const { nextConfidence } = usageAdjustment(30, 60);
      expect(nextConfidence).toBeGreaterThan(60);
    });
    it("يقترح التقاعد للخبرة منخفضة الثقة بعد استخدام كافٍ", () => {
      expect(usageAdjustment(15, 20).suggestRetire).toBe(true);
      expect(usageAdjustment(2, 20).suggestRetire).toBe(false);
    });
  });

  describe("classifyDomain", () => {
    it("مجال واحد → مجاله", () => {
      expect(classifyDomain(["erp", "erp"])).toBe("erp");
    });
    it("مجالات مختلفة → عابرة للمجالات", () => {
      expect(classifyDomain(["erp", "crm"])).toBe("cross_domain");
    });
    it("بلا مجال → عامة", () => {
      expect(classifyDomain(["generic", ""])).toBe("general");
    });
  });
});

// ============================================================
// pattern-discovery
// ============================================================

function frag(key: string, projectId: string, signal: ObservationFragment["signal"], statement = key): ObservationFragment {
  return { key, projectId, signal, statement };
}

describe("discoverPatterns", () => {
  it("الظهور في مشروع واحد حالة لا نمط", () => {
    const patterns = discoverPatterns([frag("approval chain", "p1", "success")]);
    expect(patterns).toHaveLength(0);
  });

  it("نجاح متكرّر عبر مشاريع = نمط نجاح", () => {
    const patterns = discoverPatterns([
      frag("approval chain", "p1", "success"),
      frag("approval chain", "p2", "success"),
    ]);
    expect(patterns[0].patternType).toBe("success_pattern");
    expect(patterns[0].projectCount).toBe(2);
  });

  it("فشل متكرّر = نمط فشل", () => {
    const patterns = discoverPatterns([
      frag("late migration", "p1", "failure"),
      frag("late migration", "p2", "failure"),
    ]);
    expect(patterns[0].patternType).toBe("failure_pattern");
  });

  it("نجاح وفشل لنفس المفتاح = نمط مضادّ", () => {
    const patterns = discoverPatterns([
      frag("big bang release", "p1", "success"),
      frag("big bang release", "p2", "failure"),
    ]);
    expect(patterns[0].patternType).toBe("anti_pattern");
  });

  it("نجاح واسع (٥ مشاريع+) = أفضل ممارسة", () => {
    const patterns = discoverPatterns(
      ["p1", "p2", "p3", "p4", "p5"].map((p) => frag("code review gate", p, "success"))
    );
    expect(patterns[0].patternType).toBe("best_practice");
  });

  it("يجمع المشاريع المتمايزة ويتجاهل التكرار داخل المشروع", () => {
    const patterns = discoverPatterns([
      frag("rbac", "p1", "success"),
      frag("rbac", "p1", "success"),
      frag("rbac", "p2", "success"),
    ]);
    expect(patterns[0].projectCount).toBe(2);
  });
});

// ============================================================
// sanitize
// ============================================================

describe("sanitizeExperience", () => {
  it("يُخفي PII", () => {
    const r = sanitizeExperience("راسل العميل على ahmed@client.com");
    expect(r.text).not.toContain("ahmed@client.com");
    expect(r.piiMasked).toBe(1);
  });

  it("يجرّد اسم المشروع/العميل", () => {
    const r = sanitizeExperience("نظام شركة النور للمقاولات ممتاز", ["شركة النور"]);
    expect(r.text).toContain("[الجهة]");
    expect(r.namesStripped).toBe(1);
  });

  it("يتجاهل الأسماء القصيرة جدًا (تفادي الإيجابيات الكاذبة)", () => {
    const r = sanitizeExperience("نصّ عادي", ["ال"]);
    expect(r.namesStripped).toBe(0);
  });

  it("isSafeForLibrary يمسك PII المكشوف", () => {
    expect(isSafeForLibrary("نصّ نظيف")).toBe(true);
    expect(isSafeForLibrary("البريد a@b.com")).toBe(false);
  });
});

// ============================================================
// lessons
// ============================================================

describe("buildLessonsReport", () => {
  const signals: LessonSignal[] = [
    { statement: "بوّابة مراجعة الكود", category: "worked", weight: 90 },
    { statement: "ترحيل متأخّر", category: "failed", weight: 80 },
    { statement: "أتمتة النشر", category: "improved", weight: 70 },
  ];

  it("يصنّف الإشارات للفئات الثلاث", () => {
    const r = buildLessonsReport(signals);
    expect(r.whatWorked).toContain("بوّابة مراجعة الكود");
    expect(r.whatFailed).toContain("ترحيل متأخّر");
    expect(r.whatImproved).toContain("أتمتة النشر");
  });

  it("يشتقّ توصيات قابلة للفعل", () => {
    const r = buildLessonsReport(signals);
    expect(r.recommendations.some((x) => x.startsWith("كرّر:"))).toBe(true);
    expect(r.avoidThese.some((x) => x.startsWith("تجنّب:"))).toBe(true);
  });

  it("يرتّب بالأهمية", () => {
    const r = buildLessonsReport([
      { statement: "أقلّ", category: "worked", weight: 10 },
      { statement: "أهمّ", category: "worked", weight: 90 },
    ]);
    expect(r.whatWorked[0]).toBe("أهمّ");
  });
});
