import { describe, expect, it } from "vitest";
import {
  READINESS_METRICS,
  READINESS_METRICS_ORDERED,
  READINESS_REGISTRY,
  getReadinessDefinition,
  getReadinessKeyForStage,
  computeReadinessForStage,
  computeAllReadiness,
  computeOverallReadiness,
  hasAllReadinessMetrics,
} from "./index";
import type { WorkflowV2ChecklistItemState } from "@/lib/workflow-v2";

describe("project-readiness / registry", () => {
  it("يحتوي على 6 مقاييس بالضبط", () => {
    expect(READINESS_METRICS.length).toBe(6);
    expect(READINESS_METRICS_ORDERED.length).toBe(6);
    expect(Object.keys(READINESS_REGISTRY).length).toBe(6);
  });

  it("ترتيب المقاييس متصاعد بلا فجوات", () => {
    const orders = READINESS_METRICS_ORDERED.map((m) => m.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("كل مقياس مربوط بمرحلة workflow_v2 موجودة", () => {
    const valid = new Set([
      "discovery_and_research",
      "analysis_and_validation",
      "product_definition",
      "prototype_and_review",
      "client_approval",
      "handoff_and_closure",
    ]);
    for (const m of READINESS_METRICS_ORDERED) {
      expect(valid.has(m.workflowStageKey)).toBe(true);
    }
  });

  it("getReadinessKeyForStage يرجّع المقياس الصح لكل مرحلة", () => {
    expect(getReadinessKeyForStage("discovery_and_research")).toBe("discovery_completeness");
    expect(getReadinessKeyForStage("product_definition")).toBe("product_definition_ready");
    expect(getReadinessKeyForStage("handoff_and_closure")).toBe("handoff_ready");
    expect(getReadinessKeyForStage("client_and_project")).toBeNull(); // مش من الست
  });

  it("getReadinessDefinition يرجّع التعريف الكامل", () => {
    const def = getReadinessDefinition("handoff_ready");
    expect(def.order).toBe(6);
    expect(def.workflowStageKey).toBe("handoff_and_closure");
  });
});

describe("project-readiness / compute", () => {
  const empty: WorkflowV2ChecklistItemState[] = [];

  function state(itemKey: string, status: WorkflowV2ChecklistItemState["status"]): WorkflowV2ChecklistItemState {
    return { itemKey, status };
  }

  it("مرحلة بدون تقدّم = 0%", () => {
    const r = computeReadinessForStage("product_definition", empty);
    expect(r.percentage).toBe(0);
    expect(r.breakdown.mandatoryCompleted).toBe(0);
  });

  it("كل الإلزامي مكتمل + مفيش اختياري متطبق = 80%", () => {
    // Product Definition عندها 5 mandatory و 4 optional
    const items: WorkflowV2ChecklistItemState[] = [
      state("problem_brief", "completed"),
      state("target_users_and_personas", "completed"),
      state("scope_and_mvp", "completed"),
      state("user_flows", "completed"),
      state("features_and_requirements", "completed"),
    ];
    const r = computeReadinessForStage("product_definition", items);
    expect(r.percentage).toBe(80);
    expect(r.breakdown.mandatoryCompleted).toBe(5);
  });

  it("كل الإلزامي + كل الاختياري مكتمل = 100%", () => {
    const items: WorkflowV2ChecklistItemState[] = [
      state("problem_brief", "completed"),
      state("target_users_and_personas", "completed"),
      state("scope_and_mvp", "completed"),
      state("user_flows", "completed"),
      state("features_and_requirements", "completed"),
      state("business_rules", "completed"),
      state("risks_assumptions_dependencies", "completed"),
      state("success_metrics", "completed"),
      state("open_questions", "completed"),
    ];
    const r = computeReadinessForStage("product_definition", items);
    expect(r.percentage).toBe(100);
  });

  it("skipped يُعامَل كمكتمل", () => {
    const items: WorkflowV2ChecklistItemState[] = [
      state("problem_brief", "completed"),
      state("target_users_and_personas", "skipped"),
      state("scope_and_mvp", "completed"),
      state("user_flows", "completed"),
      state("features_and_requirements", "completed"),
    ];
    const r = computeReadinessForStage("product_definition", items);
    expect(r.percentage).toBe(80);
  });

  it("blocked لا يُعدّ اكتمالًا", () => {
    const items: WorkflowV2ChecklistItemState[] = [
      state("problem_brief", "blocked"),
      state("target_users_and_personas", "completed"),
      state("scope_and_mvp", "completed"),
      state("user_flows", "completed"),
      state("features_and_requirements", "completed"),
    ];
    const r = computeReadinessForStage("product_definition", items);
    // 4/5 إلزامي = 80% * 80 = 64%
    expect(r.percentage).toBe(64);
  });

  it("computeAllReadiness يرجّع الستة كلها بالترتيب", () => {
    const results = computeAllReadiness({});
    expect(results.length).toBe(6);
    expect(results[0].metric).toBe("discovery_completeness");
    expect(results[5].metric).toBe("handoff_ready");
  });

  it("computeOverallReadiness = متوسط المقاييس", () => {
    const results = [
      { metric: "discovery_completeness" as const, percentage: 100, breakdown: {mandatoryTotal:0,mandatoryCompleted:0,optionalTotal:0,optionalCompleted:0}, items: [] },
      { metric: "problem_validation" as const, percentage: 50, breakdown: {mandatoryTotal:0,mandatoryCompleted:0,optionalTotal:0,optionalCompleted:0}, items: [] },
      { metric: "product_definition_ready" as const, percentage: 0, breakdown: {mandatoryTotal:0,mandatoryCompleted:0,optionalTotal:0,optionalCompleted:0}, items: [] },
    ];
    expect(computeOverallReadiness(results)).toBe(50);
    expect(computeOverallReadiness([])).toBe(0);
  });

  it("hasAllReadinessMetrics يتحقق من اكتمال المصفوفة", () => {
    const full = computeAllReadiness({});
    expect(hasAllReadinessMetrics(full)).toBe(true);
    expect(hasAllReadinessMetrics(full.slice(0, 3))).toBe(false);
  });
});
