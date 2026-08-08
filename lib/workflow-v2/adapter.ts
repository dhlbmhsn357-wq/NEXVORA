/**
 * NEXVORA Workflow v1 → v2 Adapter (Read-Only)
 * ============================================
 *
 * الغرض: عرض المشاريع القديمة (اللي مبنيّة على الـ 25 stage v1 legacy) في
 * واجهة NEXVORA v2 (7 مراحل) **بدون كتابة أي شيء في جداول v1 ولا تحويل
 * تاريخها**. مجرد ترجمة عرض.
 *
 * القاعدة: لكل stage قديم، بنحدّد "أي مرحلة v2 هو منتمي لها منطقيًا".
 * المراحل القديمة اللي جزء من Extended Technical Delivery (Claude Exec،
 * Engineering QA، Production Monitoring، Migration، Hypercare) بترجّع
 * `null` — يعني ما بتظهرش في Workflow v2 للمشاريع الجديدة، لكن للمشاريع
 * القديمة اللي عندها تاريخ فيها، الـ UI بيعرضها تحت قسم منفصل موسّم
 * "Extended Technical Delivery — Legacy".
 *
 * ------------------------------------------------------------------------
 * NEXVORA فيه ثلاث طبقات مراحل مستقلّة (orthogonal):
 *   1. project.stage (9 حالات lifecycle): lead → intake → ... → support
 *      — الحالة الإدارية لعلاقة المشروع.
 *   2. Workflow v1 (25 stage legacy): pipeline قديم.
 *      — يُستخدم عند projects.workflow_version = 'v1'.
 *   3. Workflow v2 (7 مراحل NEXVORA): pipeline product-focused جديد.
 *      — يُستخدم عند projects.workflow_version = 'v2'.
 * الطبقات مستقلّة — مشروع ممكن يكون في v2 stage 3 بينما project.stage = 'prototype'.
 * ------------------------------------------------------------------------
 */

import type { WorkflowV2StageKey } from "./types";

/** كل الـ v1 stage keys اللي بنعرفها (يطابق lib/workflow/types.ts). */
export type WorkflowV1StageKey =
  | "overview"
  | "discovery"
  | "analysis"
  | "meetingPreparation"
  | "meetingPresentation"
  | "meetings"
  | "deliveryMilestones"
  | "knowledgeHub"
  | "projectBrain"
  | "smartRecommendations"
  | "brainReview"
  | "prd"
  | "prototypePrompt"
  | "prototypeReview"
  | "promptReview"
  | "developerHandoff"
  | "clientDelivery"
  | "engineeringQa"
  | "fixPrompt"
  | "engineeringQaReview"
  | "productionMonitoring"
  | "productionMonitoringPrompt"
  | "productionMonitoringReview"
  | "organizationalIntelligence"
  | "support";

/**
 * الخريطة الأساسية.
 * `null` = هذه المرحلة v1 مش جزء من الـ 7 (تنتمي لـ Extended Technical
 * Delivery أو cross-cutting زي Knowledge Hub).
 */
export const V1_TO_V2_STAGE_MAP: Record<WorkflowV1StageKey, WorkflowV2StageKey | null> = {
  // مرحلة 1 — Client & Project
  overview: "client_and_project",

  // مرحلة 2 — Discovery & Research
  discovery: "discovery_and_research",
  meetingPreparation: "discovery_and_research",
  meetingPresentation: "discovery_and_research",
  meetings: "discovery_and_research",

  // مرحلة 3 — Analysis & Validation
  analysis: "analysis_and_validation",
  projectBrain: "analysis_and_validation",
  smartRecommendations: "analysis_and_validation",
  brainReview: "analysis_and_validation",

  // مرحلة 4 — Product Definition
  prd: "product_definition",

  // مرحلة 5 — Prototype & Review
  prototypePrompt: "prototype_and_review",
  prototypeReview: "prototype_and_review",
  promptReview: "prototype_and_review",

  // مرحلة 6 — Client Approval
  clientDelivery: "client_approval",

  // مرحلة 7 — Handoff & Closure
  developerHandoff: "handoff_and_closure",

  // Extended Technical Delivery (Legacy) — مش جزء من الـ 7
  engineeringQa: null,
  fixPrompt: null,
  engineeringQaReview: null,
  productionMonitoring: null,
  productionMonitoringPrompt: null,
  productionMonitoringReview: null,
  deliveryMilestones: null,

  // Cross-cutting — مش مرحلة بنفسها
  knowledgeHub: null,
  organizationalIntelligence: null,
  support: null,
};

/** يترجم v1 stage → v2 stage. يرجّع null لو v1 stage لا يخص NEXVORA Core. */
export function mapV1ToV2(v1: WorkflowV1StageKey): WorkflowV2StageKey | null {
  return V1_TO_V2_STAGE_MAP[v1] ?? null;
}

/** كل الـ v1 stages اللي بتنتمي لمرحلة v2 معيّنة. */
export function getV1StagesForV2(v2: WorkflowV2StageKey): WorkflowV1StageKey[] {
  return (Object.entries(V1_TO_V2_STAGE_MAP) as [WorkflowV1StageKey, WorkflowV2StageKey | null][])
    .filter(([, mapped]) => mapped === v2)
    .map(([v1]) => v1);
}

/** v1 stages المصنّفة "Extended Technical Delivery" (مش في الـ 7). */
export function getLegacyExtendedTechnicalStages(): WorkflowV1StageKey[] {
  return [
    "engineeringQa",
    "fixPrompt",
    "engineeringQaReview",
    "productionMonitoring",
    "productionMonitoringPrompt",
    "productionMonitoringReview",
    "deliveryMilestones",
  ];
}

/** هل الـ stage v1 دي legacy technical (مخفية في NEXVORA Core)؟ */
export function isLegacyExtendedTechnical(v1: WorkflowV1StageKey): boolean {
  return getLegacyExtendedTechnicalStages().includes(v1);
}

/** أي إصدار workflow يعتمده المشروع. */
export type ProjectWorkflowVersion = "v1" | "v2";

/**
 * قرار العرض: أي واجهة workflow نرسم لهذا المشروع.
 *
 * القاعدة:
 *   • workflow_version = 'v2'  → ارسم v2 مباشرة (المشروع الجديد).
 *   • workflow_version = 'v1'  → ارسم v1 (الـ 25 stage legacy) — بدون تغيير.
 *
 * الـ Adapter مش هنا (mapV1ToV2 فوق). الـ UI بيقرر بناءً على الرجّع ده.
 */
export function selectWorkflowUiVersion(project: {
  workflow_version?: ProjectWorkflowVersion | null;
}): ProjectWorkflowVersion {
  return project.workflow_version === "v2" ? "v2" : "v1";
}
