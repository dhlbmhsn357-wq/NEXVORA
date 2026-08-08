/**
 * NEXVORA Workflow v2 — Registry
 * ==============================
 *
 * تعريف المراحل السبع + عناصر الـ Checklist لكل مرحلة **كـ single source
 * of truth في الكود** (متطابق مع Seed في migration 0096). القيم الحيّة
 * تُقرأ من DB في P3+ عبر service، لكن هنا كل ما يحتاج الكود server-side
 * وclient-side بدون round-trip.
 */

import type {
  WorkflowV2StageKey,
  WorkflowV2StageDefinition,
  WorkflowV2ChecklistItem,
} from "./types";

// ---------------------------------------------------------------------------
// المراحل السبع
// ---------------------------------------------------------------------------
export const WORKFLOW_V2_REGISTRY: Record<WorkflowV2StageKey, WorkflowV2StageDefinition> = {
  client_and_project: {
    key: "client_and_project",
    slug: "client-and-project",
    displayName: "العميل والمشروع",
    description: "تأهيل العميل، تحويل Lead لمشروع، تعيين مسؤول، تحديد الميزانية والمدة.",
    icon: "Users",
    order: 1,
    dependencies: [],
  },
  discovery_and_research: {
    key: "discovery_and_research",
    slug: "discovery-and-research",
    displayName: "الاكتشاف والبحث",
    description: "نماذج الاكتشاف، جلسات العميل، أبحاث السوق والمنافسين، مقابلات المستخدمين.",
    icon: "Search",
    order: 2,
    dependencies: ["client_and_project"],
  },
  analysis_and_validation: {
    key: "analysis_and_validation",
    slug: "analysis-and-validation",
    displayName: "التحليل والتحقق",
    description: "تحليل الاكتشاف، بناء عقل المشروع، توصيات، تحقق من المشاكل والافتراضات.",
    icon: "Brain",
    order: 3,
    dependencies: ["discovery_and_research"],
  },
  product_definition: {
    key: "product_definition",
    slug: "product-definition",
    displayName: "تعريف المنتج",
    description: "Scope & MVP، Personas، User Flows، Requirements، User Stories، Acceptance Criteria.",
    icon: "Layers",
    order: 4,
    dependencies: ["analysis_and_validation"],
  },
  prototype_and_review: {
    key: "prototype_and_review",
    slug: "prototype-and-review",
    displayName: "Prototype والمراجعة",
    description: "توليد Prototype Prompt V2، مراجعة المنتج، تعليقات، إصلاحات، اعتماد.",
    icon: "Wand2",
    order: 5,
    dependencies: ["product_definition"],
  },
  client_approval: {
    key: "client_approval",
    slug: "client-approval",
    displayName: "موافقة العميل",
    description: "عرض Prototype + Scope للعميل عبر Portal آمن، موافقة مثبّتة على نسخة.",
    icon: "BadgeCheck",
    order: 6,
    dependencies: ["prototype_and_review"],
  },
  handoff_and_closure: {
    key: "handoff_and_closure",
    slug: "handoff-and-closure",
    displayName: "التسليم والإغلاق",
    description: "حزمة التسليم النهائية (Product Handoff Package) + استلام من الشريك التقني.",
    icon: "PackageCheck",
    order: 7,
    dependencies: ["client_approval"],
  },
};

/** كل التعريفات مرتّبة (بديل عن Object.values عشان الترتيب مضمون). */
export const WORKFLOW_V2_STAGES_ORDERED: readonly WorkflowV2StageDefinition[] = [
  WORKFLOW_V2_REGISTRY.client_and_project,
  WORKFLOW_V2_REGISTRY.discovery_and_research,
  WORKFLOW_V2_REGISTRY.analysis_and_validation,
  WORKFLOW_V2_REGISTRY.product_definition,
  WORKFLOW_V2_REGISTRY.prototype_and_review,
  WORKFLOW_V2_REGISTRY.client_approval,
  WORKFLOW_V2_REGISTRY.handoff_and_closure,
] as const;

export function getStageDefinition(key: WorkflowV2StageKey): WorkflowV2StageDefinition {
  return WORKFLOW_V2_REGISTRY[key];
}

// ---------------------------------------------------------------------------
// عناصر Checklist لكل مرحلة (متطابق مع migration 0096 seed)
// ---------------------------------------------------------------------------
export const WORKFLOW_V2_CHECKLISTS: Record<WorkflowV2StageKey, WorkflowV2ChecklistItem[]> = {
  client_and_project: [
    { stageKey: "client_and_project", itemKey: "lead_qualification",       displayName: "تأهيل العميل المحتمل",                       description: "", order: 1, isMandatory: true  },
    { stageKey: "client_and_project", itemKey: "project_created",          displayName: "إنشاء المشروع من Lead",                       description: "", order: 2, isMandatory: true  },
    { stageKey: "client_and_project", itemKey: "industry_and_service",     displayName: "تحديد القطاع ونوع الخدمة",                   description: "", order: 3, isMandatory: true  },
    { stageKey: "client_and_project", itemKey: "budget_and_duration",      displayName: "الميزانية والمدة المتوقعة",                   description: "", order: 4, isMandatory: true  },
    { stageKey: "client_and_project", itemKey: "owner_assigned",           displayName: "تعيين مسؤول المشروع",                         description: "", order: 5, isMandatory: true  },
    { stageKey: "client_and_project", itemKey: "initial_contract",         displayName: "عقد ودفعة أولى (اختياري)",                     description: "", order: 6, isMandatory: false },
  ],
  discovery_and_research: [
    { stageKey: "discovery_and_research", itemKey: "discovery_form_created",   displayName: "إنشاء نموذج اكتشاف",                       description: "", order: 1, isMandatory: true  },
    { stageKey: "discovery_and_research", itemKey: "discovery_link_sent",      displayName: "إرسال رابط الاكتشاف للعميل",              description: "", order: 2, isMandatory: true  },
    { stageKey: "discovery_and_research", itemKey: "discovery_submitted",      displayName: "استلام إجابات العميل",                     description: "", order: 3, isMandatory: true  },
    { stageKey: "discovery_and_research", itemKey: "meeting_prep_generated",   displayName: "تجهيز أول اجتماع اكتشاف",                 description: "", order: 4, isMandatory: false },
    { stageKey: "discovery_and_research", itemKey: "discovery_meeting_held",   displayName: "عقد الاجتماع وتوثيق نتائجه",              description: "", order: 5, isMandatory: false },
    { stageKey: "discovery_and_research", itemKey: "market_research",          displayName: "بحث السوق (اختياري)",                      description: "", order: 6, isMandatory: false },
    { stageKey: "discovery_and_research", itemKey: "competitor_research",      displayName: "بحث المنافسين (اختياري)",                 description: "", order: 7, isMandatory: false },
    { stageKey: "discovery_and_research", itemKey: "customer_interviews",      displayName: "مقابلات المستخدمين (اختياري)",             description: "", order: 8, isMandatory: false },
  ],
  analysis_and_validation: [
    { stageKey: "analysis_and_validation", itemKey: "discovery_analysis",       displayName: "تحليل الاكتشاف (17 قسم)",                  description: "", order: 1, isMandatory: true  },
    { stageKey: "analysis_and_validation", itemKey: "project_brain_built",      displayName: "بناء عقل المشروع (Brain v2)",              description: "", order: 2, isMandatory: true  },
    { stageKey: "analysis_and_validation", itemKey: "smart_recommendations",    displayName: "مراجعة التوصيات الذكية",                   description: "", order: 3, isMandatory: false },
    { stageKey: "analysis_and_validation", itemKey: "problem_validation",       displayName: "تحقق المشاكل والافتراضات",                  description: "", order: 4, isMandatory: true  },
    { stageKey: "analysis_and_validation", itemKey: "brain_review_approved",    displayName: "اعتماد Brain Review (7 blockers)",         description: "", order: 5, isMandatory: true  },
  ],
  product_definition: [
    { stageKey: "product_definition", itemKey: "problem_brief",                  displayName: "Problem Brief",                             description: "", order: 1, isMandatory: true  },
    { stageKey: "product_definition", itemKey: "target_users_and_personas",      displayName: "المستخدمون المستهدفون + Personas",         description: "", order: 2, isMandatory: true  },
    { stageKey: "product_definition", itemKey: "scope_and_mvp",                  displayName: "Scope & MVP (Must/Should/Could/Won't)",     description: "", order: 3, isMandatory: true  },
    { stageKey: "product_definition", itemKey: "user_flows",                     displayName: "User Flows",                                description: "", order: 4, isMandatory: true  },
    { stageKey: "product_definition", itemKey: "features_and_requirements",      displayName: "الميزات والمتطلبات",                       description: "", order: 5, isMandatory: true  },
    { stageKey: "product_definition", itemKey: "business_rules",                 displayName: "قواعد العمل",                               description: "", order: 6, isMandatory: false },
    { stageKey: "product_definition", itemKey: "risks_assumptions_dependencies", displayName: "المخاطر والافتراضات والاعتمادات",           description: "", order: 7, isMandatory: false },
    { stageKey: "product_definition", itemKey: "success_metrics",                displayName: "مؤشرات النجاح",                             description: "", order: 8, isMandatory: false },
    { stageKey: "product_definition", itemKey: "open_questions",                 displayName: "أسئلة مفتوحة (اختياري)",                   description: "", order: 9, isMandatory: false },
  ],
  prototype_and_review: [
    { stageKey: "prototype_and_review", itemKey: "studio_config_ready",             displayName: "تجهيز Studio config",                        description: "إعداد نوع/هدف/منصّة/فيدلتي + Personas + Flows في Prototype Studio", order: 1, isMandatory: true  },
    { stageKey: "prototype_and_review", itemKey: "context_pack_ready",              displayName: "توليد Context Pack",                         description: "تجميع deterministic لسياق المشروع من مصادر NEXVORA (بدون AI)", order: 2, isMandatory: true  },
    { stageKey: "prototype_and_review", itemKey: "build_brief_approved",            displayName: "اعتماد Build Brief من ChatGPT",              description: "استيراد ونقل الـ brief من ChatGPT ثم اعتماده بشريًا", order: 3, isMandatory: true  },
    { stageKey: "prototype_and_review", itemKey: "codex_pack_ready",                displayName: "تجهيز Codex Build Pack",                     description: "حزمة النقل النهائية لـ Codex (Constitution + Context + Brief + Starter)", order: 4, isMandatory: true  },
    { stageKey: "prototype_and_review", itemKey: "prototype_link_available",        displayName: "رابط Prototype جاهز للمراجعة",              description: "", order: 5, isMandatory: true  },
    { stageKey: "prototype_and_review", itemKey: "product_review_completed",        displayName: "إنجاز Product Review",                       description: "", order: 6, isMandatory: true  },
    { stageKey: "prototype_and_review", itemKey: "iterations_resolved",             displayName: "معالجة تعليقات المراجعة",                   description: "", order: 7, isMandatory: false },
  ],
  client_approval: [
    { stageKey: "client_approval", itemKey: "client_presentation_ready",  displayName: "عرض العميل جاهز (PPTX + Portal)",                description: "", order: 1, isMandatory: true  },
    { stageKey: "client_approval", itemKey: "client_portal_link_shared",  displayName: "مشاركة رابط Portal الآمن مع العميل",              description: "", order: 2, isMandatory: true  },
    { stageKey: "client_approval", itemKey: "scope_approved",             displayName: "اعتماد Scope",                                    description: "", order: 3, isMandatory: true  },
    { stageKey: "client_approval", itemKey: "prototype_approved",         displayName: "اعتماد Prototype",                                description: "", order: 4, isMandatory: true  },
    { stageKey: "client_approval", itemKey: "package_pre_approved",       displayName: "موافقة مبدئية على حزمة التسليم",                 description: "", order: 5, isMandatory: false },
    { stageKey: "client_approval", itemKey: "commercial_agreement",       displayName: "اعتماد Pricing/Proposals (اختياري)",             description: "", order: 6, isMandatory: false },
  ],
  handoff_and_closure: [
    { stageKey: "handoff_and_closure", itemKey: "package_assembled",           displayName: "تجميع Handoff Package",                       description: "", order: 1, isMandatory: true  },
    { stageKey: "handoff_and_closure", itemKey: "evaluation_guide_ready",      displayName: "Product Evaluation Guide مكتمل",              description: "", order: 2, isMandatory: true  },
    { stageKey: "handoff_and_closure", itemKey: "external_partner_invited",    displayName: "دعوة الشريك التقني الخارجي",                 description: "", order: 3, isMandatory: false },
    { stageKey: "handoff_and_closure", itemKey: "partner_questions_resolved",  displayName: "معالجة أسئلة الشريك التقني",                 description: "", order: 4, isMandatory: false },
    { stageKey: "handoff_and_closure", itemKey: "package_delivered",           displayName: "تسليم الحزمة",                                description: "", order: 5, isMandatory: true  },
    { stageKey: "handoff_and_closure", itemKey: "handoff_accepted",            displayName: "قبول رسمي من الشريك التقني",                 description: "", order: 6, isMandatory: true  },
  ],
};

/** helper يجيب checklist مرحلة معيّنة. */
export function getChecklistForStage(key: WorkflowV2StageKey): WorkflowV2ChecklistItem[] {
  return WORKFLOW_V2_CHECKLISTS[key];
}

/** helper يعدّ العناصر الإلزامية داخل مرحلة. */
export function countMandatoryItems(key: WorkflowV2StageKey): number {
  return WORKFLOW_V2_CHECKLISTS[key].filter((i) => i.isMandatory).length;
}
