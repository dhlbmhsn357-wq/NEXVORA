import { describe, expect, it } from "vitest";
import { mapAnalysisToBrainContent } from "./mapper";
import {
  enumerateReviewObjects,
  computeMissingReviewObjects,
  isBlockingReviewState,
  detectChangedItemKeys,
  cascadeRevalidation,
  computeReviewProgress,
} from "./review-objects";
import type { DiscoveryAnalysisOutput } from "@/lib/discovery-analysis/types";
import type { BrainReviewObject, BrainReviewObjectDependency } from "@/lib/types/database";

const ev = [{ question_id: "q1", question_label: "س؟", quote: "الإجابة" }];
const okConf = { score: 85, reason: null };

function baseAnalysis(): DiscoveryAnalysisOutput {
  return {
    executive_summary: { summary: "ملخص", confidence: okConf, evidence: ev },
    business_model: { overview: "أ", how_it_works: "ب", value_delivery: "ج", users_description: "د", confidence: okConf, evidence: ev },
    stakeholders: { items: [{ name: "المدير", role: "قرار", influence: "high", evidence: ev }], confidence: okConf },
    business_goals: { items: [{ goal: "زيادة", priority: "high", evidence: ev }], confidence: okConf },
    functional_requirements: { items: [{ statement: "تسجيل", evidence: ev }], confidence: okConf },
    non_functional_requirements: { performance: [], security: [{ statement: "تشفير", evidence: ev }], scalability: [], availability: [], accessibility: [], compliance: [], confidence: okConf },
    risks: { items: [{ risk: "بطء", cause: "شبكة", likelihood: "medium", impact: "high", evidence: ev }], confidence: okConf },
    assumptions: { items: [{ statement: "دفع محلي", reason: "افتراضي", evidence: ev }], confidence: okConf },
    missing_information: { items: [{ info: "الميزانية", impact: "high", reason: "غير مذكورة" }], confidence: okConf },
    suggested_features: { items: [], confidence: okConf },
    suggested_integrations: { items: [], confidence: okConf },
    suggested_user_roles: { items: [{ role: "مسؤول", responsibilities: ["إدارة"], evidence: ev }], confidence: okConf },
    suggested_kpis: { items: [], confidence: okConf },
    suggested_user_stories: { items: [], confidence: okConf },
    suggested_project_scope: { in_scope: [{ statement: "حجز", evidence: ev }], out_of_scope: [], confidence: okConf },
    suggested_roadmap: { phases: [{ phase: "MVP", description: "أول", deliverables: ["حجز"], evidence: ev }], confidence: okConf },
    meeting_questions: { items: [{ question: "الميزانية؟", reason: "للتخطيط", priority: "high" }], confidence: okConf },
  };
}

describe("enumerateReviewObjects", () => {
  it("يعدّد عناصر من الأقسام القائمة على مصفوفات، ويستثني الأقسام السردية", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const objects = enumerateReviewObjects(content);
    expect(objects.some((o) => o.section_key === "business_goals")).toBe(true);
    expect(objects.some((o) => o.section_key === "risks")).toBe(true);
    expect(objects.some((o) => o.section_key === "executive_summary")).toBe(false);
    expect(objects.some((o) => o.section_key === "business_model")).toBe(false);
  });
});

describe("computeMissingReviewObjects", () => {
  it("يرجّع بس العناصر اللي مفيهاش صف موجود بالفعل", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const enumerated = enumerateReviewObjects(content);
    const existing: BrainReviewObject[] = [
      {
        id: "1",
        document_id: "d1",
        project_id: "p1",
        section_key: enumerated[0].section_key,
        item_key: enumerated[0].item_key,
        item_title: enumerated[0].item_title,
        state: "pending_review",
        reason: null,
        reviewer_id: null,
        reviewed_at: null,
        version: 1,
        needs_revalidation: false,
        revalidation_reason: null,
        created_at: "",
        updated_at: "",
      },
    ];
    const missing = computeMissingReviewObjects(enumerated, existing);
    expect(missing.length).toBe(enumerated.length - 1);
    expect(missing.some((m) => m.item_key === enumerated[0].item_key && m.section_key === enumerated[0].section_key)).toBe(false);
  });
});

describe("isBlockingReviewState", () => {
  it("pending_review/needs_revision/blocked بس اللي عائقة", () => {
    expect(isBlockingReviewState("pending_review")).toBe(true);
    expect(isBlockingReviewState("needs_revision")).toBe(true);
    expect(isBlockingReviewState("blocked")).toBe(true);
    expect(isBlockingReviewState("approved")).toBe(false);
    expect(isBlockingReviewState("approved_with_modification")).toBe(false);
    expect(isBlockingReviewState("deferred")).toBe(false);
    expect(isBlockingReviewState("rejected")).toBe(false);
  });
});

describe("detectChangedItemKeys", () => {
  it("يكتشف عنصر اتغيّر محتواه بين نسختين", () => {
    const oldContent = mapAnalysisToBrainContent(baseAnalysis());
    const newAnalysis = baseAnalysis();
    newAnalysis.business_goals.items[0].goal = "هدف مختلف تمامًا";
    const newContent = mapAnalysisToBrainContent(newAnalysis);

    const changed = detectChangedItemKeys(oldContent, newContent);
    expect(changed.some((c) => c.section_key === "business_goals")).toBe(true);
  });

  it("مفيش تغييرات لو نفس المحتوى بالظبط", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const changed = detectChangedItemKeys(content, content);
    expect(changed.length).toBe(0);
  });
});

describe("cascadeRevalidation", () => {
  it("بيعلّم العنصر اللي بيعتمد على عنصر اتغيّر (قفزة واحدة)", () => {
    const deps: BrainReviewObjectDependency[] = [
      {
        id: "d1",
        document_id: "doc1",
        project_id: "p1",
        review_object_id: "obj-b",
        depends_on_review_object_id: "obj-a",
        relation_type: "depends_on",
        source: "ai_inferred",
        created_at: "",
      },
    ];
    const result = cascadeRevalidation(new Set(["obj-a"]), deps);
    expect(result.has("obj-a")).toBe(true);
    expect(result.has("obj-b")).toBe(true);
  });

  it("متكرّرش لأبعد من قفزة واحدة", () => {
    const deps: BrainReviewObjectDependency[] = [
      { id: "d1", document_id: "doc1", project_id: "p1", review_object_id: "obj-b", depends_on_review_object_id: "obj-a", relation_type: "depends_on", source: "ai_inferred", created_at: "" },
      { id: "d2", document_id: "doc1", project_id: "p1", review_object_id: "obj-c", depends_on_review_object_id: "obj-b", relation_type: "depends_on", source: "ai_inferred", created_at: "" },
    ];
    const result = cascadeRevalidation(new Set(["obj-a"]), deps);
    expect(result.has("obj-b")).toBe(true);
    expect(result.has("obj-c")).toBe(false);
  });

  it("بيتجاهل conflicts_with/related_to — مش cascade عليهم", () => {
    const deps: BrainReviewObjectDependency[] = [
      { id: "d1", document_id: "doc1", project_id: "p1", review_object_id: "obj-b", depends_on_review_object_id: "obj-a", relation_type: "conflicts_with", source: "ai_inferred", created_at: "" },
    ];
    const result = cascadeRevalidation(new Set(["obj-a"]), deps);
    expect(result.has("obj-b")).toBe(false);
  });
});

describe("computeReviewProgress", () => {
  function obj(state: BrainReviewObject["state"], needsRevalidation = false): BrainReviewObject {
    return {
      id: Math.random().toString(),
      document_id: "d1",
      project_id: "p1",
      section_key: "business_goals",
      item_key: "x",
      item_title: "x",
      state,
      reason: null,
      reviewer_id: null,
      reviewed_at: null,
      version: 1,
      needs_revalidation: needsRevalidation,
      revalidation_reason: null,
      created_at: "",
      updated_at: "",
    };
  }

  it("يحسب الملخص صح", () => {
    const objects = [obj("pending_review"), obj("approved"), obj("approved", true), obj("blocked")];
    const summary = computeReviewProgress(objects);
    expect(summary.total).toBe(4);
    expect(summary.byState.pending_review).toBe(1);
    expect(summary.byState.approved).toBe(2);
    expect(summary.byState.blocked).toBe(1);
    expect(summary.blockingCount).toBe(2); // pending_review + blocked
    expect(summary.needsRevalidationCount).toBe(1);
  });
});
