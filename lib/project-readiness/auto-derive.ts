/**
 * NEXVORA Project Readiness — Auto Derive
 * =======================================
 *
 * يحوّل البيانات الفعلية الّتي تُحمَّل بالفعل داخل صفحة تفاصيل المشروع
 * إلى حالات checklist لكل مرحلة v2 — كي يقدر `computeAllReadiness` يحسب
 * الستّ نسب الجاهزية بشكل حقيقي بدلًا من الصفر الافتراضي.
 *
 * قواعد ذهبية:
 *   • لا يخلق إدخالات "in_progress" ولا "blocked" — كل عنصر إمّا مكتمل
 *     ("completed") أو غير مبتدأ ("not_started"). البشر وحدهم يقرّرون
 *     الحالات الوسطى (blocked/skipped)؛ نحن نقيس الاكتمال الموضوعي.
 *   • كل حقل في `DerivedReadinessInput` اختياري: لو غير موجود ⇒
 *     "not_started" (لا نفبرك اكتمالًا لأن البيانات غائبة).
 *   • لا نلمس مشاريع v1 — الملف بيتنادى فقط من فرع workflowV2Enabled في
 *     الصفحة، والحسابات كلها defensive لو أي مشروع v2 قديم بيانات ناقصة.
 */

import { WORKFLOW_V2_CHECKLISTS } from "@/lib/workflow-v2";
import type {
  WorkflowV2ChecklistItemState,
  WorkflowV2StageKey,
} from "@/lib/workflow-v2";

// ---------------------------------------------------------------------------
// Input contract — كل الحقول اختيارية (missing ⇒ not_started)
// ---------------------------------------------------------------------------
export interface DerivedReadinessInput {
  project?: {
    id: string;
    stage?: string | null;
    owner_id?: string | null;
    ai_analysis?: unknown;
  };
  hasDiscoveryForm?: boolean;
  discoveryLinkSentCount?: number;
  discoverySubmittedCount?: number;
  meetingPrepCount?: number;
  meetingsCount?: number;
  discoveryAnalysisExists?: boolean;
  brainDoc?: { status: string | null; version?: number } | null;
  brainReviewApproved?: boolean;
  smartRecommendationsResolvedCount?: number;
  smartRecommendationsPendingCount?: number;
  problemValidationCount?: number;
  personasCount?: number;
  userFlowsCount?: number;
  requirementsCount?: number;
  storiesCount?: number;
  acceptanceCriteriaCount?: number;
  marketResearchCount?: number;
  competitorResearchCount?: number;
  contractsCount?: number;
  studioConfigExists?: boolean;
  studioContextPackExists?: boolean;
  studioApprovedBriefExists?: boolean;
  studioCodexPackExists?: boolean;
  prototypeLink?: string | null;
  prototypeReviewApproved?: boolean;
  clientApprovals?: Array<{ status: string; decision: string | null }>;
  handoffPackages?: Array<{ status: string }>;
  handoffMandatoryCompletedCount?: number;
  handoffMandatoryTotalCount?: number;
  decisionsCount?: number;
  risksCount?: number;
  /** derived قبل ما يتبعت: هل فيه أي requirement priority='must' */
  scopeAndMvpMarked?: boolean;
}

// ---------------------------------------------------------------------------
// Small helper: build a state entry
// ---------------------------------------------------------------------------
function state(
  itemKey: string,
  done: boolean
): WorkflowV2ChecklistItemState {
  return { itemKey, status: done ? "completed" : "not_started" };
}

/** يضمن إن كل عناصر المرحلة موجودة في الخريطة (اللي غير محسوبة ⇒ not_started). */
function fillMissingItems(
  stage: WorkflowV2StageKey,
  derived: Map<string, boolean>
): WorkflowV2ChecklistItemState[] {
  return WORKFLOW_V2_CHECKLISTS[stage].map((item) =>
    state(item.itemKey, derived.get(item.itemKey) === true)
  );
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
/**
 * يحوّل بيانات المشروع إلى خريطة حالات checklist جاهزة لتغذية
 * `computeAllReadiness`. أي مرحلة لا نستطيع اشتقاق أيّ من عناصرها
 * (لأن البيانات كلها غائبة) ترجع مصفوفة عناصر بحالة not_started —
 * وهو ما يعطي 0% للنسبة بشكل صحيح.
 */
export function autoDeriveChecklistStates(
  input: DerivedReadinessInput
): Partial<Record<WorkflowV2StageKey, WorkflowV2ChecklistItemState[]>> {
  const out: Partial<Record<WorkflowV2StageKey, WorkflowV2ChecklistItemState[]>> = {};

  const {
    project,
    hasDiscoveryForm,
    discoveryLinkSentCount = 0,
    discoverySubmittedCount = 0,
    meetingPrepCount = 0,
    meetingsCount = 0,
    discoveryAnalysisExists,
    brainDoc,
    brainReviewApproved,
    smartRecommendationsResolvedCount = 0,
    smartRecommendationsPendingCount = 0,
    problemValidationCount = 0,
    personasCount = 0,
    userFlowsCount = 0,
    requirementsCount = 0,
    marketResearchCount = 0,
    competitorResearchCount = 0,
    contractsCount = 0,
    studioConfigExists,
    studioContextPackExists,
    studioApprovedBriefExists,
    studioCodexPackExists,
    prototypeLink,
    prototypeReviewApproved,
    clientApprovals = [],
    handoffPackages = [],
    handoffMandatoryCompletedCount = 0,
    handoffMandatoryTotalCount = 0,
    decisionsCount = 0,
    risksCount = 0,
    scopeAndMvpMarked,
  } = input;

  // -------------------------------------------------------------------------
  // 1) client_and_project
  //    ملاحظة: هذه المرحلة ليست ضمن الستّ نسب في READINESS_METRICS_ORDERED،
  //    لكن نحن نملأها كي يبقى الـ output متّسقًا لو أُضيفت لاحقًا.
  // -------------------------------------------------------------------------
  {
    const d = new Map<string, boolean>();
    d.set("lead_qualification", !!project?.stage);
    d.set("project_created", !!project?.id);
    // industry — لا يوجد حقل مباشر على projects حاليًا؛ نتركه not_started.
    d.set("industry_and_service", false);
    d.set("budget_and_duration", contractsCount >= 1);
    d.set("owner_assigned", project?.owner_id != null);
    d.set("initial_contract", contractsCount >= 1);
    out.client_and_project = fillMissingItems("client_and_project", d);
  }

  // -------------------------------------------------------------------------
  // 2) discovery_and_research
  // -------------------------------------------------------------------------
  {
    const d = new Map<string, boolean>();
    d.set("discovery_form_created", hasDiscoveryForm === true);
    d.set("discovery_link_sent", discoveryLinkSentCount >= 1);
    d.set("discovery_submitted", discoverySubmittedCount >= 1);
    d.set("meeting_prep_generated", meetingPrepCount >= 1);
    d.set("discovery_meeting_held", meetingsCount >= 1);
    d.set("market_research", marketResearchCount >= 1);
    d.set("competitor_research", competitorResearchCount >= 1);
    // proxy: interviews table غير موجودة — نعتبر problem_validation دليل.
    d.set("customer_interviews", problemValidationCount >= 1);
    out.discovery_and_research = fillMissingItems("discovery_and_research", d);
  }

  // -------------------------------------------------------------------------
  // 3) analysis_and_validation
  // -------------------------------------------------------------------------
  {
    const d = new Map<string, boolean>();
    d.set("discovery_analysis", discoveryAnalysisExists === true);
    d.set("project_brain_built", !!brainDoc && brainDoc.status !== null);
    d.set(
      "smart_recommendations",
      smartRecommendationsPendingCount === 0 && smartRecommendationsResolvedCount >= 1
    );
    d.set("problem_validation", problemValidationCount >= 1);
    // مقبول إمّا صراحة (brainReviewApproved) أو ضمنيًا (brainDoc.status='approved')
    d.set(
      "brain_review_approved",
      brainReviewApproved === true || brainDoc?.status === "approved"
    );
    out.analysis_and_validation = fillMissingItems("analysis_and_validation", d);
  }

  // -------------------------------------------------------------------------
  // 4) product_definition
  // -------------------------------------------------------------------------
  {
    const d = new Map<string, boolean>();
    // لا يوجد كيان مستقل لـ problem_brief — نستخدم personas كـ proxy على
    // أن "من هم المستخدمون" الأساس الأول للمشكلة.
    d.set("problem_brief", personasCount >= 1);
    d.set("target_users_and_personas", personasCount >= 1);
    d.set("scope_and_mvp", scopeAndMvpMarked === true);
    d.set("user_flows", userFlowsCount >= 1);
    d.set("features_and_requirements", requirementsCount >= 1);
    // proxy: business_rules لا يوجد جدول مستقل — 3+ متطلبات دليل عملي.
    d.set("business_rules", requirementsCount >= 3);
    d.set("risks_assumptions_dependencies", risksCount >= 1);
    // success_metrics — لا مصدر بيانات بعد؛ يظل يدويًا.
    d.set("success_metrics", false);
    // proxy: سجل القرارات يحوي open_question ضمن item_type.
    d.set("open_questions", decisionsCount >= 1);
    out.product_definition = fillMissingItems("product_definition", d);
  }

  // -------------------------------------------------------------------------
  // 5) prototype_and_review
  // -------------------------------------------------------------------------
  {
    const d = new Map<string, boolean>();
    d.set("studio_config_ready", studioConfigExists === true);
    d.set("context_pack_ready", studioContextPackExists === true);
    d.set("build_brief_approved", studioApprovedBriefExists === true);
    d.set("codex_pack_ready", studioCodexPackExists === true);
    d.set(
      "prototype_link_available",
      typeof prototypeLink === "string" && prototypeLink.trim() !== ""
    );
    d.set("product_review_completed", prototypeReviewApproved === true);
    // iterations_resolved — لا مصدر تلقائي؛ يظل يدويًا.
    d.set("iterations_resolved", false);
    out.prototype_and_review = fillMissingItems("prototype_and_review", d);
  }

  // -------------------------------------------------------------------------
  // 6) client_approval
  //    الحقيقة إن العميل اعتمد أي حاجة تُشتق من `clientApprovals` — أي approval
  //    بحالة decided ودقّة approved تعني "الاعتماد حصل".
  // -------------------------------------------------------------------------
  {
    const hasApproval = clientApprovals.some(
      (a) => a.status === "decided" && a.decision === "approved"
    );
    const d = new Map<string, boolean>();
    // كل عناصر المرحلة تشترك في نفس الإشارة: "هل حصل اعتماد نهائي؟"
    // (Portal + Presentation + Scope + Prototype + Package + Commercial)
    // — نحن لا نمتلك تمييزًا دقيقًا لكل نوع approval حاليًا، فنعامل الوجود
    // كإشارة عامة. المستخدم يقدر يرفعها فرديًا لاحقًا لو ربطنا نوع
    // approval بعنصر checklist محدّد.
    d.set("client_presentation_ready", hasApproval);
    d.set("client_portal_link_shared", hasApproval);
    d.set("scope_approved", hasApproval);
    d.set("prototype_approved", hasApproval);
    d.set("package_pre_approved", hasApproval);
    d.set("commercial_agreement", hasApproval);
    out.client_approval = fillMissingItems("client_approval", d);
  }

  // -------------------------------------------------------------------------
  // 7) handoff_and_closure
  // -------------------------------------------------------------------------
  {
    const anyPackage = handoffPackages.length >= 1;
    const anyFinalized = handoffPackages.some((p) => p.status === "finalized");
    const mandatoryDone =
      handoffMandatoryTotalCount >= 7 &&
      handoffMandatoryCompletedCount === handoffMandatoryTotalCount;

    const d = new Map<string, boolean>();
    d.set("package_assembled", anyPackage);
    d.set("evaluation_guide_ready", mandatoryDone);
    // partner_* — لا مصدر تلقائي بسيط، نتركهم يدويين.
    d.set("external_partner_invited", false);
    d.set("partner_questions_resolved", false);
    d.set("package_delivered", anyFinalized);
    d.set("handoff_accepted", anyFinalized);
    out.handoff_and_closure = fillMissingItems("handoff_and_closure", d);
  }

  return out;
}
