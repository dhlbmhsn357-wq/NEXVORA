import { describe, expect, it } from "vitest";
import {
  ALL_V2_STAGES,
  STAGE_ORDER,
  WORKFLOW_V2_REGISTRY,
  WORKFLOW_V2_STAGES_ORDERED,
  getStageDefinition,
  getChecklistForStage,
  countMandatoryItems,
  mapV1ToV2,
  getV1StagesForV2,
  getLegacyExtendedTechnicalStages,
  isLegacyExtendedTechnical,
  selectWorkflowUiVersion,
  V1_TO_V2_STAGE_MAP,
  type WorkflowV2StageKey,
  type WorkflowV1StageKey,
} from "./index";

describe("workflow-v2 / registry", () => {
  it("يحتوي على 7 مراحل بالضبط", () => {
    expect(ALL_V2_STAGES.length).toBe(7);
    expect(Object.keys(WORKFLOW_V2_REGISTRY).length).toBe(7);
    expect(WORKFLOW_V2_STAGES_ORDERED.length).toBe(7);
  });

  it("ترتيب المراحل صحيح ومتصاعد بلا فجوات", () => {
    const orders = WORKFLOW_V2_STAGES_ORDERED.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("STAGE_ORDER مطابق للـ registry", () => {
    for (const stage of WORKFLOW_V2_STAGES_ORDERED) {
      expect(STAGE_ORDER[stage.key]).toBe(stage.order);
    }
  });

  it("dependencies تشير لمراحل موجودة فقط (بلا مراجع dangling)", () => {
    for (const stage of WORKFLOW_V2_STAGES_ORDERED) {
      for (const dep of stage.dependencies) {
        expect(WORKFLOW_V2_REGISTRY[dep]).toBeDefined();
      }
    }
  });

  it("كل مرحلة تعتمد فقط على مرحلة سابقة (لا cycles، لا forward deps)", () => {
    for (const stage of WORKFLOW_V2_STAGES_ORDERED) {
      for (const dep of stage.dependencies) {
        const depOrder = STAGE_ORDER[dep];
        expect(depOrder).toBeLessThan(stage.order);
      }
    }
  });

  it("getStageDefinition يرجّع التعريف الصحيح", () => {
    const s = getStageDefinition("product_definition");
    expect(s.order).toBe(4);
    expect(s.displayName).toContain("المنتج");
  });
});

describe("workflow-v2 / checklists", () => {
  it("لكل مرحلة عناصر checklist معرّفة", () => {
    for (const key of ALL_V2_STAGES) {
      const items = getChecklistForStage(key);
      expect(items.length).toBeGreaterThan(0);
      // كل عنصر بيشير للـ stage الصح
      for (const item of items) {
        expect(item.stageKey).toBe(key);
      }
    }
  });

  it("ترتيب العناصر داخل كل مرحلة بلا فجوات", () => {
    for (const key of ALL_V2_STAGES) {
      const items = getChecklistForStage(key);
      const orders = items.map((i) => i.order).sort((a, b) => a - b);
      // ما يشترطش يبدأ من 1، بس يشترط ترتيب متصاعد بدون تكرار
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBeGreaterThan(orders[i - 1]);
      }
    }
  });

  it("كل مرحلة فيها عنصر إلزامي واحد على الأقل", () => {
    for (const key of ALL_V2_STAGES) {
      expect(countMandatoryItems(key)).toBeGreaterThan(0);
    }
  });

  it("المراحل الحرجة (product_definition, handoff_and_closure) فيها الحد الأدنى المطلوب", () => {
    // Product Definition لازم يحوي على الأقل: problem_brief, scope_and_mvp, personas, flows, requirements
    const pd = getChecklistForStage("product_definition").map((i) => i.itemKey);
    expect(pd).toContain("problem_brief");
    expect(pd).toContain("scope_and_mvp");
    expect(pd).toContain("target_users_and_personas");
    expect(pd).toContain("user_flows");
    expect(pd).toContain("features_and_requirements");

    // Handoff & Closure لازم يحوي: package_assembled, evaluation_guide_ready, handoff_accepted
    const ho = getChecklistForStage("handoff_and_closure").map((i) => i.itemKey);
    expect(ho).toContain("package_assembled");
    expect(ho).toContain("evaluation_guide_ready");
    expect(ho).toContain("handoff_accepted");
  });

  it("مفاتيح الـ items فريدة داخل كل مرحلة", () => {
    for (const key of ALL_V2_STAGES) {
      const keys = getChecklistForStage(key).map((i) => i.itemKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("workflow-v2 / adapter (v1 → v2)", () => {
  it("mapV1ToV2 يترجم المراحل القديمة الأساسية للمرحلة الصح", () => {
    expect(mapV1ToV2("overview")).toBe<WorkflowV2StageKey>("client_and_project");
    expect(mapV1ToV2("discovery")).toBe<WorkflowV2StageKey>("discovery_and_research");
    expect(mapV1ToV2("meetings")).toBe<WorkflowV2StageKey>("discovery_and_research");
    expect(mapV1ToV2("analysis")).toBe<WorkflowV2StageKey>("analysis_and_validation");
    expect(mapV1ToV2("projectBrain")).toBe<WorkflowV2StageKey>("analysis_and_validation");
    expect(mapV1ToV2("brainReview")).toBe<WorkflowV2StageKey>("analysis_and_validation");
    expect(mapV1ToV2("prd")).toBe<WorkflowV2StageKey>("product_definition");
    expect(mapV1ToV2("prototypePrompt")).toBe<WorkflowV2StageKey>("prototype_and_review");
    expect(mapV1ToV2("clientDelivery")).toBe<WorkflowV2StageKey>("client_approval");
    expect(mapV1ToV2("developerHandoff")).toBe<WorkflowV2StageKey>("handoff_and_closure");
  });

  it("مراحل Extended Technical Delivery ترجع null", () => {
    const legacy: WorkflowV1StageKey[] = [
      "engineeringQa",
      "fixPrompt",
      "engineeringQaReview",
      "productionMonitoring",
      "productionMonitoringPrompt",
      "productionMonitoringReview",
      "deliveryMilestones",
    ];
    for (const key of legacy) {
      expect(mapV1ToV2(key)).toBeNull();
      expect(isLegacyExtendedTechnical(key)).toBe(true);
    }
  });

  it("cross-cutting stages ترجع null (مش مراحل بنفسها)", () => {
    expect(mapV1ToV2("knowledgeHub")).toBeNull();
    expect(mapV1ToV2("organizationalIntelligence")).toBeNull();
    expect(mapV1ToV2("support")).toBeNull();
  });

  it("getV1StagesForV2 يرجّع كل الـ v1 المرتبطة بمرحلة v2 معيّنة", () => {
    const discovery = getV1StagesForV2("discovery_and_research");
    expect(discovery).toContain("discovery");
    expect(discovery).toContain("meetings");
    expect(discovery).toContain("meetingPreparation");
    expect(discovery).toContain("meetingPresentation");

    const analysis = getV1StagesForV2("analysis_and_validation");
    expect(analysis).toContain("analysis");
    expect(analysis).toContain("projectBrain");
    expect(analysis).toContain("smartRecommendations");
    expect(analysis).toContain("brainReview");
  });

  it("كل v1 stage له تصنيف (لا missing keys في الخريطة)", () => {
    // نفس عدد الـ stages في type — لو أي واحدة زادت في v1 وما اتضافتش هنا،
    // TypeScript هيكسر compile قبل الاختبار حتى.
    const stagesInMap = Object.keys(V1_TO_V2_STAGE_MAP).length;
    expect(stagesInMap).toBe(25);
  });

  it("getLegacyExtendedTechnicalStages يرجّع 7 مراحل تقنية", () => {
    expect(getLegacyExtendedTechnicalStages().length).toBe(7);
  });
});

describe("workflow-v2 / project version selection", () => {
  it("مشروع بدون workflow_version → v1 default (المشاريع القديمة سليمة)", () => {
    expect(selectWorkflowUiVersion({})).toBe("v1");
    expect(selectWorkflowUiVersion({ workflow_version: null })).toBe("v1");
    expect(selectWorkflowUiVersion({ workflow_version: undefined })).toBe("v1");
  });

  it("مشروع workflow_version='v1' → v1", () => {
    expect(selectWorkflowUiVersion({ workflow_version: "v1" })).toBe("v1");
  });

  it("مشروع workflow_version='v2' → v2", () => {
    expect(selectWorkflowUiVersion({ workflow_version: "v2" })).toBe("v2");
  });
});
