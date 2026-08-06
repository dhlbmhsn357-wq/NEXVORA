import { describe, expect, it } from "vitest";
import { mapAnalysisToBrainContent } from "./mapper";
import { computeBrainCompleteness, listEmptySections } from "./completeness";
import { validateBrainForApproval } from "./validation";
import { diffBrainContents } from "./diff";
import type { DiscoveryAnalysisOutput } from "@/lib/discovery-analysis/types";

const ev = [{ question_id: "q1", question_label: "س؟", quote: "الإجابة" }];
const okConf = { score: 85, reason: null };

function makeAnalysis(): DiscoveryAnalysisOutput {
  return {
    executive_summary: { summary: "ملخص", confidence: okConf, evidence: ev },
    business_model: {
      overview: "أ",
      how_it_works: "ب",
      value_delivery: "ج",
      users_description: "د",
      confidence: okConf,
      evidence: ev,
    },
    stakeholders: {
      items: [{ name: "المدير", role: "قرار", influence: "high", evidence: ev }],
      confidence: okConf,
    },
    business_goals: {
      items: [{ goal: "زيادة الطلاب", priority: "high", evidence: ev }],
      confidence: okConf,
    },
    functional_requirements: {
      items: [{ statement: "تسجيل", evidence: ev }],
      confidence: okConf,
    },
    non_functional_requirements: {
      performance: [],
      security: [{ statement: "تشفير", evidence: ev }],
      scalability: [],
      availability: [],
      accessibility: [],
      compliance: [{ statement: "GDPR", evidence: ev }],
      confidence: okConf,
    },
    risks: {
      items: [{ risk: "بطء", cause: "شبكة", likelihood: "medium", impact: "high", evidence: ev }],
      confidence: okConf,
    },
    assumptions: {
      items: [{ statement: "دفع محلي", reason: "لا معلومة", evidence: ev }],
      confidence: okConf,
    },
    missing_information: {
      items: [{ info: "الميزانية", impact: "high", reason: "غير مذكورة" }],
      confidence: okConf,
    },
    suggested_features: {
      items: [{ title: "شاشة حجز", rationale: "طلب صريح", priority: "high", evidence: ev }],
      confidence: okConf,
    },
    suggested_integrations: {
      items: [{ title: "SMS", rationale: "تذكير", priority: "medium", evidence: ev }],
      confidence: okConf,
    },
    suggested_user_roles: {
      items: [{ role: "مسؤول", responsibilities: ["إدارة"], evidence: ev }],
      confidence: okConf,
    },
    suggested_kpis: {
      items: [{ name: "معدل الحجز", target_or_direction: "≥60%", goal_link: "زيادة", evidence: ev }],
      confidence: okConf,
    },
    suggested_user_stories: {
      items: [{ role: "طالب", want: "أحجز", benefit: "أوفر وقت", priority: "high", evidence: ev }],
      confidence: okConf,
    },
    suggested_project_scope: {
      in_scope: [{ statement: "حجز", evidence: ev }],
      out_of_scope: [{ statement: "دفع", evidence: ev }],
      confidence: okConf,
    },
    suggested_roadmap: {
      phases: [{ phase: "MVP", description: "أول", deliverables: ["حجز"], evidence: ev }],
      confidence: okConf,
    },
    meeting_questions: {
      items: [{ question: "الميزانية؟", reason: "للتخطيط", priority: "high" }],
      confidence: okConf,
    },
  };
}

describe("mapAnalysisToBrainContent", () => {
  it("ينتج كل الأقسام الـ19 من ناتج تحليل صحيح", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    expect(content.executive_summary.content).toBe("ملخص");
    expect(content.business_goals.content).toHaveLength(1);
    expect(content.stakeholders.content).toHaveLength(1);
    expect(content.risks.content).toHaveLength(1);
    // business_rules — قسم جديد بلا مصدر مباشر → فاضي ومصدر future_update
    expect(content.business_rules.content).toEqual([]);
    expect(content.business_rules.meta.source).toBe("future_update");
    // constraints مشتق من NFR compliance + security
    expect(content.constraints.content).toHaveLength(2);
    expect(content.constraints.content[0].type).toBe("legal");
    // known_facts مشتق من functional_requirements
    expect(content.known_facts.content).toHaveLength(1);
    expect(content.known_facts.meta.source).toBe("discovery");
  });

  it("يحافظ على مصدر AI Analysis لكل الأقسام المطابقة", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    expect(content.executive_summary.meta.source).toBe("ai_analysis");
    expect(content.risks.meta.source).toBe("ai_analysis");
    expect(content.suggested_features.meta.source).toBe("ai_analysis");
  });
});

describe("computeBrainCompleteness", () => {
  it("يحسب النتيجة من الأقسام المكتملة × ثقتها", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    const score = computeBrainCompleteness(content);
    expect(score).toBeGreaterThan(60);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("يعتبر business_rules اختياريًا (فاضي = يتخطى)", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    const empties = listEmptySections(content);
    expect(empties).toContain("business_rules");
  });
});

describe("validateBrainForApproval", () => {
  it("يقبل content كامل من التحليل الصحي", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    const r = validateBrainForApproval(content);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("يرفض لو قسم إلزامي فاضي (مثلاً executive_summary)", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    content.executive_summary.content = "";
    const r = validateBrainForApproval(content);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.section === "executive_summary")).toBe(true);
  });

  it("يرفض عنصرًا بدون evidence", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    (content.functional_requirements.content[0] as { evidence: unknown[] }).evidence = [];
    const r = validateBrainForApproval(content);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "missing_evidence")).toBe(true);
  });

  it("يرفض التكرار داخل قسم واحد", () => {
    const content = mapAnalysisToBrainContent(makeAnalysis());
    content.functional_requirements.content.push({ statement: "تسجيل", evidence: ev });
    const r = validateBrainForApproval(content);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "duplicate")).toBe(true);
  });
});

describe("diffBrainContents", () => {
  it("يكتشف التطابق كـ unchanged", () => {
    const a = mapAnalysisToBrainContent(makeAnalysis());
    const b = mapAnalysisToBrainContent(makeAnalysis());
    const diffs = diffBrainContents(a, b);
    expect(diffs.every((d) => d.kind === "unchanged")).toBe(true);
  });

  it("يكتشف إضافة عنصر في قسم", () => {
    const a = mapAnalysisToBrainContent(makeAnalysis());
    const b = mapAnalysisToBrainContent(makeAnalysis());
    b.functional_requirements.content.push({ statement: "تسجيل خروج", evidence: ev });
    const diffs = diffBrainContents(a, b);
    const changed = diffs.find((d) => d.section === "functional_requirements");
    expect(changed?.kind).toBe("modified");
    expect(changed?.addedItems).toContain("تسجيل خروج");
  });

  it("يكتشف الحذف والتعديل", () => {
    const a = mapAnalysisToBrainContent(makeAnalysis());
    const b = mapAnalysisToBrainContent(makeAnalysis());
    b.risks.content = [];
    const diffs = diffBrainContents(a, b);
    const changed = diffs.find((d) => d.section === "risks");
    expect(changed?.kind).toBe("modified");
    expect(changed?.removedItems).toContain("بطء");
  });
});
