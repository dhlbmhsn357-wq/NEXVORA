import { describe, expect, it } from "vitest";
import {
  architectureReportToSuggestion,
  groupAcceptedRecommendations,
  mergeSuggestions,
  recommendationToSuggestion,
  targetSectionForRecommendation,
  toBrainPriority,
} from "./recommendation-brain-mapping";
import type { ArchitectureValidationReport, ProjectRecommendation } from "@/lib/types/database";
import type { SuggestionItem } from "./types";

function rec(overrides: Partial<ProjectRecommendation> = {}): ProjectRecommendation {
  return {
    id: "r1",
    project_id: "p1",
    category: "architecture",
    recommendation: "بناء نموذج بيانات متماسك يربط رقم الهيكل بكل الوثائق",
    rationale: "لمنع تكرار المبيعات وفقدان الأصول",
    confidence_score: 80,
    supporting_project_ids: [],
    status: "accepted",
    priority: "critical",
    severity: "high",
    business_value: "high",
    technical_value: "high",
    affected_modules: [],
    acceptance_criteria: [],
    implementation_notes: "",
    potential_risks: "",
    expected_benefits: "",
    estimated_complexity: "large",
    evidence_source: "knowledge_graph",
    version: 1,
    ...overrides,
  } as ProjectRecommendation;
}

describe("targetSectionForRecommendation", () => {
  it("يوجّه التكاملات لقسم التكاملات المقترحة", () => {
    expect(targetSectionForRecommendation("integration")).toBe("suggested_integrations");
  });

  it("يوجّه أي تصنيف تاني للمزايا المقترحة", () => {
    expect(targetSectionForRecommendation("architecture")).toBe("suggested_features");
    expect(targetSectionForRecommendation("security")).toBe("suggested_features");
  });
});

describe("toBrainPriority", () => {
  it("يحوّل critical لأولوية عالية", () => {
    expect(toBrainPriority("critical")).toBe("high");
  });

  it("يحافظ على high/low", () => {
    expect(toBrainPriority("high")).toBe("high");
    expect(toBrainPriority("low")).toBe("low");
  });

  it("يستخدم medium كافتراضي للقيم الفارغة أو غير المعروفة", () => {
    expect(toBrainPriority(null)).toBe("medium");
    expect(toBrainPriority("whatever")).toBe("medium");
  });
});

describe("recommendationToSuggestion", () => {
  it("يوسم العنوان بتصنيف التوصية", () => {
    const s = recommendationToSuggestion(rec());
    expect(s.title).toContain("[");
    expect(s.title).toContain("نموذج بيانات متماسك");
    expect(s.priority).toBe("high");
  });

  it("يقصّ العناوين الطويلة", () => {
    const long = "ا".repeat(300);
    const s = recommendationToSuggestion(rec({ recommendation: long }));
    expect(s.title.length).toBeLessThan(160);
    expect(s.title).toContain("…");
  });

  it("يحط مبرّرًا افتراضيًا لو الـ rationale فاضي", () => {
    const s = recommendationToSuggestion(rec({ rationale: "" }));
    expect(s.rationale.length).toBeGreaterThan(0);
  });

  it("بيرفق دليلًا متتبَّعًا دايمًا (مش مصفوفة فاضية)", () => {
    const s = recommendationToSuggestion(rec());
    expect(s.evidence).toHaveLength(1);
    expect(s.evidence[0].question_id).toBe("recommendation:r1");
    expect(s.evidence[0].quote).toContain("تكرار المبيعات");
    expect(s.evidence[0].question_label).toContain("توصية معتمدة");
  });

  it("يستخدم نص التوصية كاقتباس لو الـ rationale فاضي", () => {
    const s = recommendationToSuggestion(rec({ rationale: "" }));
    expect(s.evidence[0].quote).toContain("نموذج بيانات متماسك");
  });
});

describe("mergeSuggestions", () => {
  const existing: SuggestionItem[] = [
    { title: "ميزة قائمة", rationale: "سبب", priority: "medium", evidence: [] },
  ];

  it("يضيف الجديد ويعدّه", () => {
    const incoming: SuggestionItem[] = [
      { title: "ميزة جديدة", rationale: "سبب", priority: "high", evidence: [] },
    ];
    const { merged, addedCount } = mergeSuggestions(existing, incoming);
    expect(addedCount).toBe(1);
    expect(merged).toHaveLength(2);
  });

  it("ما يكررش عنصرًا موجودًا (مقارنة بعد التطبيع)", () => {
    const incoming: SuggestionItem[] = [
      { title: "  ميزة   قائمة ", rationale: "سبب آخر", priority: "high", evidence: [] },
    ];
    const { merged, addedCount } = mergeSuggestions(existing, incoming);
    expect(addedCount).toBe(0);
    expect(merged).toHaveLength(1);
  });

  it("ما يكررش داخل نفس الدفعة الواردة", () => {
    const incoming: SuggestionItem[] = [
      { title: "مكرر", rationale: "a", priority: "high", evidence: [] },
      { title: "مكرر", rationale: "b", priority: "low", evidence: [] },
    ];
    const { addedCount } = mergeSuggestions([], incoming);
    expect(addedCount).toBe(1);
  });

  it("يصلّح عنصرًا قديمًا بلا دليل لما الوارد معاه دليل", () => {
    const stale: SuggestionItem[] = [
      { title: "[معمارية] بنية هجينة", rationale: "قديم", priority: "high", evidence: [] },
    ];
    const incoming: SuggestionItem[] = [
      {
        title: "[معمارية] بنية هجينة",
        rationale: "جديد",
        priority: "high",
        evidence: [{ question_id: "recommendation:x", question_label: "توصية معتمدة", quote: "سبب" }],
      },
    ];
    const { merged, addedCount, backfilledCount } = mergeSuggestions(stale, incoming);
    expect(addedCount).toBe(0);
    expect(backfilledCount).toBe(1);
    expect(merged).toHaveLength(1);
    expect(merged[0].evidence).toHaveLength(1);
  });

  it("ما يلمسش عنصرًا موجودًا معاه دليل أصلًا", () => {
    const withEvidence: SuggestionItem[] = [
      {
        title: "ميزة",
        rationale: "أصلي",
        priority: "high",
        evidence: [{ question_id: "q1", question_label: "س", quote: "اقتباس أصلي" }],
      },
    ];
    const incoming: SuggestionItem[] = [
      {
        title: "ميزة",
        rationale: "وارد",
        priority: "low",
        evidence: [{ question_id: "q2", question_label: "س2", quote: "اقتباس وارد" }],
      },
    ];
    const { merged, backfilledCount } = mergeSuggestions(withEvidence, incoming);
    expect(backfilledCount).toBe(0);
    expect(merged[0].rationale).toBe("أصلي");
  });
});

describe("groupAcceptedRecommendations", () => {
  it("يتجاهل غير المقبولة", () => {
    const grouped = groupAcceptedRecommendations([
      rec({ id: "a", status: "suggested" }),
      rec({ id: "b", status: "accepted" }),
    ]);
    expect(grouped.suggested_features).toHaveLength(1);
  });

  it("يفصل التكاملات عن المزايا", () => {
    const grouped = groupAcceptedRecommendations([
      rec({ id: "a", category: "integration" }),
      rec({ id: "b", category: "security" }),
    ]);
    expect(grouped.suggested_integrations).toHaveLength(1);
    expect(grouped.suggested_features).toHaveLength(1);
  });
});

describe("architectureReportToSuggestion", () => {
  const report = {
    id: "ar1",
    project_id: "p1",
    status: "ready",
    domain: "generic",
    missing_modules: [{ module_key: "auth", name: "المصادقة والصلاحيات", reason: "مطلوبة" }],
    missing_features: [],
    gaps: {},
    reused_insights: [],
    readiness_score: 40,
    ai_summary: "التصميم الحالي فيه فجوة في الربط اللوجستي.",
    last_error: null,
    generated_from_brain_version: null,
    requested_by: null,
    generated_at: new Date(0).toISOString(),
  } as ArchitectureValidationReport;

  it("يبني عنصرًا فيه الملخّص والوحدات الناقصة والجاهزية", () => {
    const s = architectureReportToSuggestion(report);
    expect(s).not.toBeNull();
    expect(s!.rationale).toContain("فجوة");
    expect(s!.rationale).toContain("المصادقة والصلاحيات");
    expect(s!.rationale).toContain("40%");
    expect(s!.priority).toBe("high");
  });

  it("يرجّع null لو مفيش ملخّص ولا وحدات ناقصة", () => {
    expect(architectureReportToSuggestion({ ...report, ai_summary: null, missing_modules: [] })).toBeNull();
  });

  it("بيرفق دليلًا متتبَّعًا للتقرير المعماري", () => {
    const s = architectureReportToSuggestion(report);
    expect(s!.evidence).toHaveLength(1);
    expect(s!.evidence[0].question_id).toBe("architecture_report:ar1");
    expect(s!.evidence[0].question_label).toContain("القرار المعماري");
  });
});
