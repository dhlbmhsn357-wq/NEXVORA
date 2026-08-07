/**
 * NEXVORA Project Readiness — Registry
 * ====================================
 *
 * تعريف الستة مقاييس اللي تحلّ محلّ Engineering/Publishing/Support
 * Readiness القديمة. كل مقياس بيقيس نسبة اكتمال مرحلة معيّنة من
 * Workflow v2 (على checklist العناصر الإلزامية بشكل أساسي).
 */

import type { WorkflowV2StageKey } from "@/lib/workflow-v2";
import type { ReadinessMetricKey, ReadinessMetricDefinition } from "./types";

export const READINESS_REGISTRY: Record<ReadinessMetricKey, ReadinessMetricDefinition> = {
  discovery_completeness: {
    key: "discovery_completeness",
    displayName: "اكتمال الاكتشاف",
    description: "نسبة اكتمال جلسات الاكتشاف والبحث ومقابلات المستخدمين.",
    workflowStageKey: "discovery_and_research",
    order: 1,
  },
  problem_validation: {
    key: "problem_validation",
    displayName: "التحقق من المشاكل",
    description: "نسبة التحليل والتحقق من الافتراضات وبناء عقل المشروع.",
    workflowStageKey: "analysis_and_validation",
    order: 2,
  },
  product_definition_ready: {
    key: "product_definition_ready",
    displayName: "جاهزية تعريف المنتج",
    description: "Scope & MVP + Personas + Flows + Requirements + Stories + AC.",
    workflowStageKey: "product_definition",
    order: 3,
  },
  prototype_ready: {
    key: "prototype_ready",
    displayName: "جاهزية الـ Prototype",
    description: "Prototype اتولّد، اترابط، اتراجع، والملاحظات اتحلّت.",
    workflowStageKey: "prototype_and_review",
    order: 4,
  },
  client_approval: {
    key: "client_approval",
    displayName: "موافقة العميل",
    description: "العميل شاف العرض و Prototype، ووافق على Scope والباقة.",
    workflowStageKey: "client_approval",
    order: 5,
  },
  handoff_ready: {
    key: "handoff_ready",
    displayName: "جاهزية التسليم",
    description: "الحزمة مكتملة، Evaluation Guide جاهز، والشريك التقني قبل.",
    workflowStageKey: "handoff_and_closure",
    order: 6,
  },
};

/** كل التعريفات مرتّبة (helper شائع للـ Dashboard). */
export const READINESS_METRICS_ORDERED: readonly ReadinessMetricDefinition[] = [
  READINESS_REGISTRY.discovery_completeness,
  READINESS_REGISTRY.problem_validation,
  READINESS_REGISTRY.product_definition_ready,
  READINESS_REGISTRY.prototype_ready,
  READINESS_REGISTRY.client_approval,
  READINESS_REGISTRY.handoff_ready,
] as const;

/** يجيب التعريف بمفتاح المقياس. */
export function getReadinessDefinition(key: ReadinessMetricKey): ReadinessMetricDefinition {
  return READINESS_REGISTRY[key];
}

/** يجيب المقياس اللي يمثّل مرحلة workflow معيّنة (لعكس الاتجاه). */
export function getReadinessKeyForStage(stage: WorkflowV2StageKey): ReadinessMetricKey | null {
  const match = READINESS_METRICS_ORDERED.find((m) => m.workflowStageKey === stage);
  return match ? match.key : null;
}
