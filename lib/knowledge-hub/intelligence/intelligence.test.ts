import { describe, expect, it } from "vitest";
import {
  insightDedupeKey,
  insightRank,
  priorityQuadrant,
  isInsightType,
  isSeverity,
} from "./insight-model";
import {
  computeIntelligenceScores,
  scoreLevel,
  type IntelligenceSignals,
} from "./scoring";
import { detectMissingCapabilities, ENTERPRISE_ESSENTIALS } from "./domain-checklist";

// ============================================================
// insight-model
// ============================================================

describe("insight-model", () => {
  describe("priorityQuadrant", () => {
    it("قيمة عالية × جهد منخفض = مكسب سريع", () => {
      expect(priorityQuadrant("critical", 20)).toBe("quick_win");
    });
    it("قيمة عالية × جهد عالٍ = مشروع كبير", () => {
      expect(priorityQuadrant("high", 80)).toBe("major_project");
    });
    it("قيمة منخفضة × جهد منخفض = وقت الفراغ", () => {
      expect(priorityQuadrant("low", 20)).toBe("fill_in");
    });
    it("قيمة منخفضة × جهد عالٍ = أعِد النظر", () => {
      expect(priorityQuadrant("info", 90)).toBe("reconsider");
    });
  });

  describe("insightRank", () => {
    it("الشدّة الأعلى تتصدّر", () => {
      const critical = insightRank({ severity: "critical", effort: 50, confidence: 60 });
      const low = insightRank({ severity: "low", effort: 50, confidence: 60 });
      expect(critical).toBeGreaterThan(low);
    });
    it("عند نفس الشدّة، الجهد الأقل يتصدّر", () => {
      const easy = insightRank({ severity: "high", effort: 10, confidence: 60 });
      const hard = insightRank({ severity: "high", effort: 90, confidence: 60 });
      expect(easy).toBeGreaterThan(hard);
    });
  });

  describe("insightDedupeKey", () => {
    it("يوحّد تنويعات العنوان العربي", () => {
      const a = insightDedupeKey({ insightType: "missing_capability", title: "الصلاحيات" });
      const b = insightDedupeKey({ insightType: "missing_capability", title: "الصلاحيّات  " });
      expect(a).toBe(b);
    });
    it("نوع مختلف = مفتاح مختلف", () => {
      const a = insightDedupeKey({ insightType: "missing_capability", title: "الأمان" });
      const b = insightDedupeKey({ insightType: "risk_prediction", title: "الأمان" });
      expect(a).not.toBe(b);
    });
  });

  it("حرّاس النوع", () => {
    expect(isInsightType("architecture")).toBe(true);
    expect(isInsightType("nonsense")).toBe(false);
    expect(isSeverity("critical")).toBe(true);
    expect(isSeverity("mega")).toBe(false);
  });
});

// ============================================================
// scoring
// ============================================================

function signals(partial: Partial<IntelligenceSignals> = {}): IntelligenceSignals {
  return {
    qualityOverall: 70,
    completenessOverall: 70,
    counts: { entities: 8, relations: 6, rules: 4, workflows: 3, requirements: 5, decisions: 3, risks: 2, items: 40 },
    openConflicts: 0,
    openGaps: 0,
    criticalRisks: 0,
    decisionsWithRationale: 3,
    missingCapabilities: 0,
    ...partial,
  };
}

describe("computeIntelligenceScores", () => {
  it("مشروع فارغ درجاته منخفضة", () => {
    const s = computeIntelligenceScores(
      signals({
        qualityOverall: 0,
        completenessOverall: 0,
        counts: { entities: 0, relations: 0, rules: 0, workflows: 0, requirements: 0, decisions: 0, risks: 0, items: 0 },
        decisionsWithRationale: 0,
      })
    );
    expect(s.maturity).toBeLessThan(20);
    expect(s.architectureReadiness).toBeLessThan(20);
  });

  it("مشروع مكتمل درجاته عالية", () => {
    const s = computeIntelligenceScores(signals({ qualityOverall: 95, completenessOverall: 95 }));
    expect(s.maturity).toBeGreaterThan(75);
    expect(s.projectReadiness).toBeGreaterThan(70);
  });

  it("التعارضات المفتوحة تخفض الجاهزية بشدّة", () => {
    const clean = computeIntelligenceScores(signals());
    const conflicted = computeIntelligenceScores(signals({ openConflicts: 10 }));
    expect(conflicted.projectReadiness).toBeLessThan(clean.projectReadiness);
  });

  it("القدرات الناقصة تخفض الجاهزية", () => {
    const complete = computeIntelligenceScores(signals());
    const gappy = computeIntelligenceScores(signals({ missingCapabilities: 8 }));
    expect(gappy.projectReadiness).toBeLessThan(complete.projectReadiness);
  });

  it("القرارات بلا سبب تخفض جاهزية المعمار", () => {
    const withRationale = computeIntelligenceScores(signals({ decisionsWithRationale: 3 }));
    const without = computeIntelligenceScores(signals({ decisionsWithRationale: 0 }));
    expect(without.architectureReadiness).toBeLessThan(withRationale.architectureReadiness);
  });

  it("المخاطر الحرجة تخفض جاهزية المشروع والمعمار", () => {
    const safe = computeIntelligenceScores(signals());
    const risky = computeIntelligenceScores(signals({ criticalRisks: 5 }));
    expect(risky.projectReadiness).toBeLessThan(safe.projectReadiness);
    expect(risky.architectureReadiness).toBeLessThan(safe.architectureReadiness);
  });

  it("كل الدرجات محصورة ٠–١٠٠", () => {
    const s = computeIntelligenceScores(signals({ qualityOverall: 200, completenessOverall: 200 }));
    for (const v of [s.maturity, s.projectReadiness, s.architectureReadiness, s.requirementCoverage]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("scoreLevel يصنّف الحدود", () => {
    expect(scoreLevel(90)).toBe("excellent");
    expect(scoreLevel(70)).toBe("good");
    expect(scoreLevel(50)).toBe("fair");
    expect(scoreLevel(10)).toBe("weak");
  });
});

// ============================================================
// domain-checklist
// ============================================================

describe("detectMissingCapabilities", () => {
  it("مشروع بلا قدرات = كل الأساسيات ناقصة", () => {
    const missing = detectMissingCapabilities([]);
    expect(missing.length).toBe(ENTERPRISE_ESSENTIALS.length);
    expect(missing.every((m) => m.origin === "essential")).toBe(true);
  });

  it("يكتشف حضور القدرة بالعربي أو الإنجليزي", () => {
    const present = ["نظام الصلاحيات", "Audit Trail", "لوحة التقارير", "User Management",
      "Backup Service", "Workflow Engine", "Notifications", "Approval", "REST API",
      "Security Layer", "Integration Hub"];
    const missing = detectMissingCapabilities(present);
    expect(missing.some((m) => m.key === "permissions")).toBe(false);
    expect(missing.some((m) => m.key === "audit_logs")).toBe(false);
    expect(missing.some((m) => m.key === "reporting")).toBe(false);
  });

  it("الصلاحيات الناقصة شدّتها حرجة", () => {
    const missing = detectMissingCapabilities([]);
    const perms = missing.find((m) => m.key === "permissions");
    expect(perms?.severity).toBe("critical");
  });

  it("يدمج قدرات المجال المتوقَّعة", () => {
    const missing = detectMissingCapabilities(["Permissions", "Audit", "Reports", "Backup",
      "Workflow", "Notifications", "Approval", "API", "Security", "Integration", "Users"],
      ["Inventory", "Chart of Accounts"]);
    const domainMisses = missing.filter((m) => m.origin === "domain");
    expect(domainMisses.map((m) => m.label)).toContain("Inventory");
    expect(domainMisses.map((m) => m.label)).toContain("Chart of Accounts");
  });

  it("عنصر مجال حاضر لا يُعدّ ناقصًا", () => {
    const missing = detectMissingCapabilities(["Inventory Module"], ["Inventory"]);
    expect(missing.some((m) => m.origin === "domain" && m.label === "Inventory")).toBe(false);
  });
});
