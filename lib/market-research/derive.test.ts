import { describe, expect, it } from "vitest";
import {
  summarizeMarketResearch,
  summarizeProblemValidation,
  classifyEvidenceQuality,
  deriveValidationReadiness,
  summarizeClassifications,
} from "./derive";
import type {
  MarketResearchItem,
  ProblemValidationItem,
  InformationClassificationMark,
} from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function mr(over: Partial<MarketResearchItem>): MarketResearchItem {
  return {
    id: "m", projectId: "prj", itemType: "other", title: "x",
    summary: "", details: {}, sourceUrl: null, sourceNotes: "",
    confidence: 50, tags: [],
    informationClass: "unclassified", confidentiality: "internal",
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}
function pv(over: Partial<ProblemValidationItem>): ProblemValidationItem {
  return {
    id: "p", projectId: "prj", evidenceType: "user_interview", title: "x",
    painPoint: "بطء الاعتماد", quote: "", sourcePerson: "", sourceRole: "",
    sourceDate: null, supportingUrl: null, supportingNotes: "",
    strength: 60, tags: [],
    informationClass: "unclassified", confidentiality: "internal",
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}
function mark(over: Partial<InformationClassificationMark>): InformationClassificationMark {
  return {
    id: "c", projectId: "prj", sourceTable: "brain_document", sourceId: "s",
    classification: "unclassified", reason: "", reviewedBy: null, reviewedAt: null,
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}

describe("summarizeMarketResearch", () => {
  it("فاضي = كل الأصفار + متوسط ثقة صفر", () => {
    const s = summarizeMarketResearch([]);
    expect(s.total).toBe(0);
    expect(s.avgConfidence).toBe(0);
    expect(s.byType.direct_competitor).toBe(0);
  });
  it("يجمع حسب النوع ويحسب متوسط الثقة", () => {
    const s = summarizeMarketResearch([
      mr({ itemType: "direct_competitor", confidence: 80 }),
      mr({ itemType: "direct_competitor", confidence: 60 }),
      mr({ itemType: "user_segment", confidence: 40 }),
      mr({ itemType: "market_trend", confidence: 90 }),
    ]);
    expect(s.total).toBe(4);
    expect(s.byType.direct_competitor).toBe(2);
    expect(s.byType.user_segment).toBe(1);
    expect(s.avgConfidence).toBe(68); // (80+60+40+90)/4 = 67.5 → 68
    expect(s.directCompetitors).toBe(2);
    expect(s.segments).toBe(1);
  });
});

describe("classifyEvidenceQuality", () => {
  it("< 40 = weak", () => {
    expect(classifyEvidenceQuality(0)).toBe("weak");
    expect(classifyEvidenceQuality(39)).toBe("weak");
  });
  it("40..69 = moderate", () => {
    expect(classifyEvidenceQuality(40)).toBe("moderate");
    expect(classifyEvidenceQuality(69)).toBe("moderate");
  });
  it(">= 70 = strong", () => {
    expect(classifyEvidenceQuality(70)).toBe("strong");
    expect(classifyEvidenceQuality(100)).toBe("strong");
  });
});

describe("summarizeProblemValidation", () => {
  it("فاضي = أصفار", () => {
    const s = summarizeProblemValidation([]);
    expect(s.total).toBe(0);
    expect(s.distinctPainPoints).toBe(0);
    expect(s.avgStrength).toBe(0);
  });
  it("pain points المتشابهة (بعد trim + lowercase) تُعدّ مرة واحدة", () => {
    const s = summarizeProblemValidation([
      pv({ painPoint: "بطء الاعتماد" }),
      pv({ painPoint: "  بطء الاعتماد  " }),
      pv({ painPoint: "غياب تقارير" }),
    ]);
    expect(s.total).toBe(3);
    expect(s.distinctPainPoints).toBe(2);
  });
  it("يجمع التصنيفات ومتوسط القوة والتنوّع", () => {
    const s = summarizeProblemValidation([
      pv({ evidenceType: "user_interview", strength: 80 }),  // strong
      pv({ evidenceType: "survey", strength: 45 }),          // moderate
      pv({ evidenceType: "analytics_data", strength: 20 }),  // weak
      pv({ evidenceType: "user_interview", strength: 90 }),  // strong
    ]);
    expect(s.byQuality.strong).toBe(2);
    expect(s.byQuality.moderate).toBe(1);
    expect(s.byQuality.weak).toBe(1);
    expect(s.byEvidenceType.user_interview).toBe(2);
    expect(s.byEvidenceType.survey).toBe(1);
    expect(s.avgStrength).toBe(59);
    expect(s.strongCount).toBe(2);
  });
});

describe("deriveValidationReadiness", () => {
  it("فاضي = 0 وليس جاهز", () => {
    const r = deriveValidationReadiness([]);
    expect(r.score).toBe(0);
    expect(r.ready).toBe(false);
    expect(r.checks.distinctPainPointsOk).toBe(false);
  });
  it("مشروع كامل التحقق = 100% وجاهز", () => {
    const rows: ProblemValidationItem[] = [
      pv({ evidenceType: "user_interview", strength: 80, painPoint: "بطء" }),
      pv({ evidenceType: "user_interview", strength: 70, painPoint: "بطء" }), // نفس الألم
      pv({ evidenceType: "survey", strength: 75, painPoint: "تقارير" }),
      pv({ evidenceType: "analytics_data", strength: 65, painPoint: "تكامل" }),
      pv({ evidenceType: "recorded_session", strength: 85, painPoint: "بطء" }),
    ];
    const r = deriveValidationReadiness(rows);
    expect(r.checks.distinctPainPointsOk).toBe(true);   // 3 pain points
    expect(r.checks.minEvidenceOk).toBe(true);          // 5 evidence
    expect(r.checks.avgStrengthOk).toBe(true);          // (80+70+75+65+85)/5 = 75
    expect(r.checks.diversityOk).toBe(true);            // 4 evidence types
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
  });
  it("تحقّق جزئي — 3 pain points لكن دليل واحد فقط", () => {
    const r = deriveValidationReadiness([
      pv({ painPoint: "ألم1" }),
      pv({ painPoint: "ألم2" }),
      pv({ painPoint: "ألم3" }),
    ]);
    expect(r.checks.distinctPainPointsOk).toBe(true);  // +30
    expect(r.checks.minEvidenceOk).toBe(false);         // <5
    expect(r.checks.diversityOk).toBe(false);           // 1 type
    // avgStrength = 60 من الافتراضي — passes ≥60
    expect(r.score).toBe(30 + 25); // 55
    expect(r.ready).toBe(false);
  });
  it("حدّ الجاهزية 70 — 3 checks تعطي 70+", () => {
    // 3 pain points (+30) + 5 evidence (+30) + 3 types (+15) = 75
    const r = deriveValidationReadiness([
      pv({ evidenceType: "user_interview", strength: 30, painPoint: "أ1" }),
      pv({ evidenceType: "user_interview", strength: 30, painPoint: "أ1" }),
      pv({ evidenceType: "survey", strength: 30, painPoint: "أ2" }),
      pv({ evidenceType: "analytics_data", strength: 30, painPoint: "أ3" }),
      pv({ evidenceType: "analytics_data", strength: 30, painPoint: "أ3" }),
    ]);
    expect(r.score).toBe(75);   // 30 + 30 + 15 (avg strength فشل)
    expect(r.ready).toBe(true);
  });
});

describe("summarizeClassifications", () => {
  it("فاضي = صفر", () => {
    const s = summarizeClassifications([]);
    expect(s.total).toBe(0);
    expect(s.verifiedRatio).toBe(0);
  });
  it("يحسب نسبة verified بدقة", () => {
    const s = summarizeClassifications([
      mark({ classification: "verified" }),
      mark({ classification: "verified" }),
      mark({ classification: "verified" }),
      mark({ classification: "needs_review" }),
      mark({ classification: "legacy" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.byClassification.verified).toBe(3);
    expect(s.byClassification.needs_review).toBe(1);
    expect(s.byClassification.legacy).toBe(1);
    expect(s.verifiedRatio).toBe(60);
  });
});
