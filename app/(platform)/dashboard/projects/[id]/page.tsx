import { notFound, redirect } from "next/navigation";
import Link from "next/link";

// كل Server Actions المستدعاة من مكوّنات هذه الصفحة (إعادة تحليل
// الاكتشاف، وتوليد PRD/Prototype Prompt/Client Presentation/Developer
// Handoff) بترث الـ maxDuration ده تلقائيًا — من غير حاجة نصدّره من كل
// ملف actions لوحده (ملفات "use server" بتسمح فقط بتصدير async
// functions، فأي export تاني زي maxDuration بيكسر الموديول بالكامل).
// AIService ممكن يستنى لغاية 70 ثانية على 429 + يعيد المحاولة، فالهامش
// هنا لازم يفضل كبير.
export const maxDuration = 260;
import { createClient } from "@/lib/supabase/server";
import DiscoveryFormEditor from "./discovery-form-editor";
import DiscoverySection from "./discovery-section";
import DiscoverySessionsPanel from "./discovery-sessions-panel";
import DiscoveryGeneratorPanel from "./discovery-generator-panel";
import { listSessions } from "@/lib/discovery-portal/session-service";
import DiscoveryAnalysisPanel from "./discovery-analysis-panel";
import MeetingPrepPanel from "./meeting-prep-panel";
import MeetingPresentationPanel from "./meeting-presentation-panel";
import BrainV2Panel from "./brain-v2-panel";
import BrainReviewPanel from "./brain-review-panel";
import ManualNoteComposer from "./manual-note-composer";
import PendingChangesPanel from "./pending-changes-panel";
import KnowledgeGraphViewer from "./knowledge-graph-viewer";
import KnowledgeGraphPanel from "./knowledge-graph-panel";
import { getKnowledgeGraphState } from "./knowledge-graph-actions";
import { getBrainPendingChanges, getBrainKnowledgeGraph } from "./brain-v2-actions";
import { getBrainReviewV2State } from "./brain-review-actions";
import { getDraftMeetingPresentation, getMeetingPresentationHistory } from "./meeting-presentation-actions";
import { getBrainSettings } from "@/lib/brain-v2/review-service";
import type { DiscoveryAnalysisRow } from "@/lib/discovery-analysis/types";
import type { MeetingPreparationRow } from "@/lib/meeting-prep/types";
import type { BrainDocumentRow } from "@/lib/brain-v2/types";
import {
  getActiveTemplates,
  getTemplateById,
  getTemplateQuestions,
  getDefaultTemplate,
} from "@/lib/discovery-templates/queries";
import ProjectBrainEntries from "./project-brain";
import AnalysisPanel from "./analysis-panel";
import WorkflowNav, { type WorkflowNavItem } from "./workflow-nav";
import { orderTabsByNexvora, getTabCategory, getVisibleNexvoraPhases, isExtendedTechnicalTabKey, EXTENDED_TAB_KEYS } from "./nexvora-tab-order";
import StageSelector from "./stage-selector";
import WorkPanel from "./work-panel";
import DeliveryLifecyclePanel from "./delivery-lifecycle-panel";
import { listMilestones } from "@/lib/work/milestone-service";
import { listProjectMembers } from "@/lib/work/project-members-service";
import type { UserRole } from "@/lib/types/database";
import FixPromptPanel from "./fix-prompt-panel";
import ProductionMonitoringPromptPanel from "./production-monitoring-prompt-panel";
import ProductionReviewVerdictPanel from "./production-review-verdict-panel";
import QaReviewGatePanel from "./qa-review-gate-panel";
import { buildWorkflowStageStates } from "@/lib/workflow/build-stage-states";
import { computeStaleness } from "@/lib/workflow/dependency-graph";
import { calculateReadiness } from "@/lib/workflow/progress-engine";
import { STAGE_REGISTRY } from "@/lib/workflow/registry";
import MeetingsPanel from "./meetings-panel";
import BrainPanel from "./brain-panel";
import PRDPanel from "./prd-panel";
import PrototypePromptPanel from "./prototype-prompt-panel";
import PrototypeStudioPanel from "./prototype-studio-panel";
import { getConfig as getStudioConfig } from "@/lib/prototype-studio/config-service";
import { getLatest as getLatestStudioArtifact } from "@/lib/prototype-studio/artifact-service";
import CodeExecutionPanel from "./code-execution-panel";
import { AICodeExecutionEngine } from "@/lib/claude-exec/execution-engine";
import ReviewPanel from "./review-panel";
import PresentationPanel from "./presentation-panel";
import DeveloperHandoffPanel from "./developer-handoff-panel";
import EngineeringQAPanel from "./engineering-qa-panel";
import { EngineeringQAEngine } from "@/lib/engineering-qa/engine";
import { StaticReviewEngine } from "@/lib/static-review/generation-service";
import { SecurityReviewEngine } from "@/lib/security-review/generation-service";
import { DatabaseReviewEngine } from "@/lib/database-review/generation-service";
import { ArchitectureReviewEngine } from "@/lib/architecture-review/generation-service";
import { CodeQualityReviewEngine } from "@/lib/code-quality-review/generation-service";
import { PerformanceReviewEngine } from "@/lib/performance-review/generation-service";
import { PrdComplianceReviewEngine } from "@/lib/prd-compliance-review/generation-service";
import { ProductionValidationEngine } from "@/lib/production-validation/generation-service";
import { ProductionMonitoringEngine } from "@/lib/production-monitoring/generation-service";
import ProductionMonitoringPanel from "./production-monitoring-panel";
import { RecommendationsEngine } from "@/lib/organizational-intelligence/recommendations-service";
import { getDecisionMemory } from "@/lib/organizational-intelligence/decision-memory-service";
import { KnowledgeExtractionEngine } from "@/lib/organizational-intelligence/extraction-service";
import { AIProductAdvisor } from "@/lib/organizational-intelligence/advisor-service";
import OrganizationalIntelligencePanel from "./organizational-intelligence-panel";
import SmartRecommendationsPanel from "./smart-recommendations-panel";
import ArchitectureIntelligencePanel from "./architecture-intelligence-panel";
import ArchitecturalRecommendationsSummary from "./architectural-recommendations-summary";
import BrainOpenItemsPanel from "./brain-open-items-panel";
import { getArchitectureReport } from "@/lib/architecture-validation/service";
import SupportPanel from "./support-panel";
import ArchiveButton from "../../archive-button";
import PromoteExperienceButton from "./promote-experience-button";
import ActivityPanel from "./activity-panel";
import CommercialPanel from "./commercial-panel";
import ResearchPanel from "./research-panel";
import DefinitionPanel from "./definition-panel";
import StoriesPanel from "./stories-panel";
import TraceabilityPanel from "./traceability-panel";
import EvaluationPanel from "./evaluation-panel";
import ClientApprovalPanel from "./_panels/client-approval-panel";
import HandoffPanel from "./_panels/handoff-panel";
import PartnersPanel from "./_panels/partners-panel";
import ChangeImpactPanel from "./_panels/change-impact-panel";
import DecisionsPanel from "./_panels/decisions-panel";
import StageOwnersPanel from "./_panels/stage-owners-panel";
import { listItems as listDecisionItems } from "@/lib/product-decisions/service";
import { listAssignments as listStageAssignments } from "@/lib/stage-assignments/service";
import { listQuestions as listHandoffQuestions, listDeliveries as listHandoffDeliveries } from "@/lib/handoff/service";
import { countCriticalOpenRisks } from "@/lib/product-decisions/derive";
import { summarizeAssignments as summarizeStageAssignments } from "@/lib/stage-assignments/derive";
import { listApprovals } from "@/lib/client-approval/service";
import { listPackages as listHandoffPackages, listItems as listHandoffItems, listPartners as listHandoffPartners } from "@/lib/handoff/service";
import CommercialFullPanel from "./commercial-full-panel";
import DeleteProjectButton from "../../delete-project-button";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { selectWorkflowUiVersion } from "@/lib/workflow-v2/adapter";
import {
  READINESS_METRICS_ORDERED,
  computeAllReadiness,
  computeOverallReadiness,
} from "@/lib/project-readiness";
import {
  getClientLifecycleStatus,
  listContracts,
  listPaymentSchedules,
} from "@/lib/commercial/service";
import {
  listMarketResearchItems,
  listProblemValidationItems,
} from "@/lib/market-research/service";
import {
  listPersonas,
  listFlows,
  listRequirements,
} from "@/lib/product-definition/service";
import {
  listStories,
  listAcceptanceCriteria,
} from "@/lib/user-stories/service";
import { listEvidenceLinks } from "@/lib/evidence/service";
import { listScenarios, listRuns } from "@/lib/evaluation/service";
import {
  listProposals, listProposalItems, listChangeRequests, listPricingPackages,
} from "@/lib/commercial-full/service";
import IncrementsPanel from "./increments-panel";
import KnowledgeHubPanel from "./knowledge-hub-panel";
import {
  listBatches as listKnowledgeBatches,
  listGaps as listKnowledgeGaps,
  listItems as listKnowledgeItems,
  listSources as listKnowledgeSources,
} from "@/lib/knowledge-hub/service";
import {
  listConflicts as listKnowledgeConflicts,
  listRelations as listKnowledgeRelations,
} from "@/lib/knowledge-hub/enrichment-service";
import { listIncrements } from "@/lib/increments/service";
import { listPrdIncrementSections } from "@/lib/prd/increment-service";
import { getProjectTimeline } from "@/lib/audit-trail/timeline-service";
import { stageLabels } from "@/lib/projects/stage-labels";
import type {
  DiscoveryFormTemplate,
  DiscoveryQuestion,
  MeetingPrepParticipant,
  MeetingRequiredItem,
  MeetingAttachment,
} from "@/lib/types/database";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawTabParam = resolvedSearchParams?.tab;
  const currentTabParam = Array.isArray(rawTabParam) ? rawTabParam[0] : rawTabParam;
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, name, project_type, stage, ai_analysis, project_code, widget_key, archived_at, stage_changed_at, owner_id, lead_id, discovery_template_id, staging_url, production_url, workflow_version, clients(company_name)"
    )
    .eq("id", id)
    .single();

  // فرق مهم: خطأ حقيقي في الاستعلام (عمود ناقص، مشكلة اتصال) لازم يظهر
  // كخطأ حقيقي (Error Boundary) عشان نشخّصه بسرعة — مش يتقنّع كـ 404
  // "الصفحة مش موجودة" وهو مش كده أصلًا. notFound() بس للحالة الحقيقية:
  // 0 صف (المشروع اتحذف/الـ id غلط).
  if (projectError) {
    console.error(`[ProjectDetailPage] فشل تحميل المشروع ${id}:`, projectError.message);
    throw new Error(`فشل تحميل بيانات المشروع: ${projectError.message}`);
  }
  if (!project || project.archived_at) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: currentProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const isAdmin = currentProfile?.role === "owner" || currentProfile?.role === "admin";
  // المدير وحده يعتمد المشروع كمصدر خبرة مؤسسية (الجزء X).
  const isDirector = currentProfile?.role === "owner";

  const { data: owner } = project.owner_id
    ? await supabase.from("profiles").select("full_name, email").eq("id", project.owner_id).maybeSingle()
    : { data: null };

  // Extended Technical Delivery — Security Gate (server-side)
  // ==========================================================
  // نحسب الفلاغ هنا (قبل أي data fetch لتبويبات execution) عشان نقدر:
  //   1) نرفض deep-link `?tab=<execution-key>` بإعادة توجيه لـ overview
  //   2) نمنع الـ N+1 fetches لبيانات تبويبات محجوبة
  // ملاحظة: الفلترة من الـ UI مش كافية — لو المستخدم زوّر الرابط لازم
  // نرفضه على الخادم فورًا قبل ما نلمس أي جدول execution.
  const extendedEnabledEarly = user
    ? await isFeatureEnabled("extended_technical_delivery", user.id)
    : false;
  if (
    !extendedEnabledEarly &&
    !!currentTabParam &&
    isExtendedTechnicalTabKey(currentTabParam)
  ) {
    redirect(`/dashboard/projects/${id}?tab=overview`);
  }

  const [
    { data: discoveryForm },
    { data: brainEntries },
    { data: meetings },
    { data: brain },
    { data: prd },
    { data: prototypePrompt },
    { data: review },
    { data: presentation },
    { data: developerHandoff },
    { data: supportRequests },
    { data: teamMembers },
    ,
    { data: discoveryAnalysis },
    { data: brainDocs },
    { data: meetingPrep },
    { data: pipelinePlan },
    { data: pipelineStages },
  ] = await Promise.all([
    supabase
      .from("discovery_forms")
      .select("id, answers, status, template_id")
      .eq("project_id", id)
      .is("link_id", null)
      .maybeSingle(),
    supabase
      .from("project_brain_entries")
      .select("id, entry_type, content, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("meetings")
      .select(
        "id, project_id, project_code, title, meeting_date, recording_url, status, created_at, updated_at, archived_at, error_code, error_message"
      )
      .eq("project_id", id)
      .is("archived_at", null)
      .order("meeting_date", { ascending: false }),
    supabase.from("project_brain").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("prd").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("prototype_prompt").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("prototype_review").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("client_presentations").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("developer_handoff").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("support_requests")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase
      .from("discovery_form_links")
      .select(
        "id, project_id, lead_id, template_id, token, status, expires_at, opened_at, submitted_at, last_activity_at, created_by, created_at, updated_at"
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("discovery_analyses")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_brain_documents")
      .select("*")
      .eq("project_id", id)
      .order("version", { ascending: false }),
    supabase.from("meeting_preparations").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("prototype_prompt_plans").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("prototype_prompt_stages")
      .select("*")
      .eq("project_id", id)
      .order("stage_index", { ascending: true }),
  ]);

  // Meeting Intelligence (Phase 2) — مشاركين/عناصر مطلوبة/مرفقات
  // تجهيز الاجتماع، مربوطين بـ meeting_preparations.id لو موجود.
  const meetingPrepId = (meetingPrep as { id: string } | null)?.id ?? null;
  const [{ data: meetingPrepParticipants }, { data: meetingRequiredItems }, { data: meetingPrepAttachments }] = meetingPrepId
    ? await Promise.all([
        supabase.from("meeting_prep_participants").select("*").eq("meeting_preparation_id", meetingPrepId),
        supabase.from("meeting_required_items").select("*").eq("meeting_preparation_id", meetingPrepId),
        supabase.from("meeting_attachments").select("*").eq("meeting_preparation_id", meetingPrepId).order("uploaded_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // Project Brain v2 — النسخ مرتّبة تنازليًا (الأحدث أولًا)
  const brainV2Versions = (brainDocs as BrainDocumentRow[] | null) ?? [];
  const brainV2Latest = brainV2Versions[0] ?? null;
  const brainV2Approved =
    brainV2Versions.find((d) => d.status === "approved") ?? null;
  // نفس أولوية getBrainForDownstreamGeneration (معتمد أولًا، وإلا آخر
  // نسخة) — عشان شارة "قديم" في PRD/Prototype Prompt/Presentation/
  // Developer Handoff تقارن بالنسخة اللي فعليًا استُخدمت في التوليد.
  const brainV2ForGeneration = brainV2Approved ?? brainV2Latest;
  // اختار الوثيقة القابلة للمراجعة (draft أو in_review) لتبويب Brain Review
  const brainV2Reviewable =
    brainV2Versions.find((d) => d.status === "draft" || d.status === "in_review") ??
    brainV2Latest;

  // كل النداءات دي مستقلة عن بعض تمامًا — كل واحد بيقرا بيانات مشروعه
  // وبس. قبل كده كانوا موزّعين على تمن حواجز `await` متتابعة، وكل حاجز
  // بيستنى اللي قبله يخلّص قبل ما يبدأ. النتيجة إن زمن فتح الصفحة كان
  // مجموع الرحلات لقاعدة البيانات بدل أطولها، وده السبب الأساسي في بطء
  // فتح المشروع. تجميعهم في حاجز واحد بيخلّي الزمن = أبطأ نداء فيهم.
  //
  // اللي فضل بره الحاجز ده هو اللي عنده تبعية حقيقية بس: qaFixLoops
  // (محتاجة currentExecutionPlan) وبيانات تجهيز الاجتماع (محتاجة
  // meetingPrepId).
  const [
    knowledgeGraphState,
    architectureReport,
    brainSettings,
    brainReviewV2State,
    executionState,
    recommendationsState,
    decisionMemory,
    extractionJobState,
    advisorState,
    brainPendingChanges,
    brainKnowledgeGraph,
    meetingPresentationDraft,
    meetingPresentationHistory,
    projectIncrements,
    prdIncrementSections,
    knowledgeBatches,
    knowledgeSources,
    knowledgeItems,
    knowledgeGaps,
    knowledgeRelations,
    knowledgeConflicts,
    discoveryTemplates,
    discoverySessions,
    workMilestones,
    workMembers,
    allUsersRes,
    timeline,
    engineeringQAState,
    staticReviewState,
    securityReviewState,
    databaseReviewState,
    architectureReviewState,
    codeQualityReviewState,
    performanceReviewState,
    prdComplianceReviewState,
    productionValidationState,
    productionMonitoringState,
  ] = await Promise.all([
    getKnowledgeGraphState(project.id),
    getArchitectureReport(id),
    getBrainSettings(supabase),
    getBrainReviewV2State(brainV2Reviewable?.id ?? null),
    AICodeExecutionEngine.getState(id),
    RecommendationsEngine.getState(id),
    getDecisionMemory(id),
    KnowledgeExtractionEngine.getState(id),
    AIProductAdvisor.getState(id),
    getBrainPendingChanges(id),
    getBrainKnowledgeGraph(id),
    getDraftMeetingPresentation(id),
    getMeetingPresentationHistory(id),
    listIncrements(supabase, id),
    listPrdIncrementSections(supabase, id),
    listKnowledgeBatches(supabase, id),
    listKnowledgeSources(supabase, id),
    listKnowledgeItems(supabase, id),
    listKnowledgeGaps(supabase, id),
    listKnowledgeRelations(supabase, id),
    listKnowledgeConflicts(supabase, id),
    getActiveTemplates(supabase),
    listSessions(supabase, project.id),
    listMilestones(project.id),
    listProjectMembers(project.id),
    supabase.from("profiles").select("id, full_name, email").neq("status", "deleted").order("full_name"),
    getProjectTimeline(supabase, id),
    EngineeringQAEngine.getState(id),
    StaticReviewEngine.getState(id),
    SecurityReviewEngine.getState(id),
    DatabaseReviewEngine.getState(id),
    ArchitectureReviewEngine.getState(id),
    CodeQualityReviewEngine.getState(id),
    PerformanceReviewEngine.getState(id),
    PrdComplianceReviewEngine.getState(id),
    ProductionValidationEngine.getState(id),
    ProductionMonitoringEngine.getState(id),
  ]);
  const {
    plans: executionPlans,
    currentPlan: currentExecutionPlan,
    tasks: executionTasks,
  } = executionState;
  const { recommendations, dependencies: recommendationDependencies } = recommendationsState;
  const { job: extractionJob } = extractionJobState;
  const { analysis: advisorAnalysis } = advisorState;
  const [{ data: qaFixLoops }, { data: accessibilityScans }, { data: releaseCandidate }] = currentExecutionPlan
    ? await Promise.all([
        supabase.from("qa_fix_loops").select("*").eq("plan_id", currentExecutionPlan.id).order("created_at", { ascending: true }),
        supabase.from("accessibility_scans").select("*").eq("plan_id", currentExecutionPlan.id).order("created_at", { ascending: true }),
        supabase.from("release_candidates").select("*").eq("plan_id", currentExecutionPlan.id).maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: null }];
  const settledKnowledgeSources = knowledgeSources.filter(
    (s) => s.status === "ready" || s.status === "failed" || s.status === "skipped_duplicate"
  ).length;
  const knowledgeHubSummary = {
    totalSources: knowledgeSources.length,
    settledSources: settledKnowledgeSources,
    failedSources: knowledgeSources.filter((s) => s.status === "failed").length,
    openGaps: knowledgeGaps.filter((g) => g.status === "open").length,
    latestUpdatedAt: knowledgeSources[0]?.updated_at ?? null,
  };


  // تحديد وضع قسم الاكتشاف:
  // - Legacy: فورم قديم متعبّى بالأسئلة الثابتة (بلا template_id) — نعرضه بالمحرر القديم
  //   عشان الإجابات المخزّنة بمفاتيحها القديمة تفضل ظاهرة صح (صفر كسر).
  // - Template: أي مشروع جديد أو فورم مبني على قالب — نعرض الـ Wizard الديناميكي.
  const discoveryAnswersObj = (discoveryForm?.answers ?? {}) as Record<string, unknown>;
  const hasLegacyAnswers = Object.values(discoveryAnswersObj).some(
    (v) => v !== undefined && v !== null && v !== ""
  );
  const isLegacyForm = !!discoveryForm && !discoveryForm.template_id && hasLegacyAnswers;

  let currentTemplate: DiscoveryFormTemplate | null = null;
  let templateQuestions: DiscoveryQuestion[] = [];

  if (!isLegacyForm) {
    let tpl: DiscoveryFormTemplate | null = null;
    if (discoveryForm?.template_id) {
      tpl = await getTemplateById(supabase, discoveryForm.template_id);
    } else if (project.discovery_template_id) {
      tpl = await getTemplateById(supabase, project.discovery_template_id);
    }
    if (!tpl) tpl = await getDefaultTemplate(supabase);
    currentTemplate = tpl;
    if (tpl) {
      templateQuestions = await getTemplateQuestions(supabase, tpl.id);
    }
  }

  // ============================================================
  // Workflow Engine (Phase 1) — بناء StageState لكل مرحلة من الـ 22
  // فوق البيانات اللي أصلًا اتقرأت فوق (مفيش استعلام إضافي جديد هنا).
  // كل قرار حالة فعلي جوّه lib/workflow/adapters/*.ts — هنا مجرد تمرير.
  // ============================================================
  const latestEngineeringQaFixLoop =
    (qaFixLoops ?? []).filter((l) => l.qa_stage === "engineering_qa").sort((a, b) => b.attempt_number - a.attempt_number)[0] ?? null;
  const openMonitoringIncidents = productionMonitoringState.incidents.filter((i) => i.status !== "resolved");
  const openSupportRequestsCount = (supportRequests ?? []).filter((r) => r.resolution_status !== "resolved").length;

  // ===== Work Management (Phase 3) data =====
  const currentUserRole = (currentProfile?.role ?? "member") as UserRole;

  // ===== Commercial + Research (P4 + P5 — behind product_mode flag) =====
  // القرار الأساسي per-project (workflow_version)، مع productModeEnabled كصمّام أمان عام.
  const productModeEnabled = user ? await isFeatureEnabled("product_mode", user.id) : false;
  const prototypeStudioEnabled = user ? await isFeatureEnabled("prototype_studio", user.id) : false;
  const [studioConfig, studioLatestContextPack] = prototypeStudioEnabled
    ? await Promise.all([
        getStudioConfig(project.id),
        getLatestStudioArtifact(project.id, "context_pack"),
      ])
    : [null, null];
  // Extended Technical Delivery flag — تم حسابه مبكرًا (فوق) لأنه يتحكم في
  // security redirect. لو الفلاغ off وتم طلب ?tab=<execution-key>، الطلب
  // تم رفضه بالفعل قبل الوصول لهنا. لا توجد backwards-compat للـ deep-link.
  const extendedEnabled = extendedEnabledEarly;
  // project.workflow_version قد يكون undefined لو الـ typegen ما تحدّثش بعد الـ 0096.
  const workflowV2Enabled = selectWorkflowUiVersion({
    workflow_version: (project as unknown as { workflow_version?: "v1" | "v2" | null }).workflow_version ?? null,
  }) === "v2" && productModeEnabled;
  const [
    commercialLifecycle, commercialContracts, commercialPayments,
    marketResearchItems, problemValidationItems,
    definitionPersonas, definitionFlows, definitionRequirements,
    storiesRows, acceptanceCriteriaRows,
    evidenceLinkRows,
    evalScenarios, evalRunsRows,
    proposalsRows, proposalItemsRows, changeRequestsRows, pricingPackagesRows,
    clientApprovalsRows, handoffPackagesRows, externalPartnersRows,
    decisionItemsRows, stageAssignmentsRows,
  ] = productModeEnabled
    ? await Promise.all([
        getClientLifecycleStatus(project.id),
        listContracts(project.id),
        listPaymentSchedules(project.id),
        listMarketResearchItems(project.id),
        listProblemValidationItems(project.id),
        listPersonas(project.id),
        listFlows(project.id),
        listRequirements(project.id),
        listStories(project.id),
        listAcceptanceCriteria(project.id),
        listEvidenceLinks(project.id),
        listScenarios(project.id),
        listRuns(project.id),
        listProposals(project.id),
        listProposalItems(project.id),
        listChangeRequests(project.id),
        listPricingPackages(),
        listApprovals(project.id),
        listHandoffPackages(project.id),
        listHandoffPartners(project.id),
        listDecisionItems(project.id),
        listStageAssignments(project.id),
      ])
    : [null, [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []];
  const latestHandoffPackage = handoffPackagesRows.length > 0 ? handoffPackagesRows[0] : null;
  const [handoffItemsRows, handoffQuestionsRows, handoffDeliveriesRows] = latestHandoffPackage
    ? await Promise.all([
        listHandoffItems(latestHandoffPackage.id),
        listHandoffQuestions(latestHandoffPackage.id),
        listHandoffDeliveries(latestHandoffPackage.id),
      ])
    : [[], [], []];
  // Readiness overview signals (display-only)
  const overdueStagesCount = productModeEnabled
    ? summarizeStageAssignments(stageAssignmentsRows, new Date().toISOString()).overdue
    : 0;
  const criticalOpenRisksCount = productModeEnabled
    ? countCriticalOpenRisks(decisionItemsRows)
    : 0;
  const canWriteCommercial = ["owner", "admin", "supervisor"].includes(currentUserRole);
  // Owner only can hard-delete
  const canDeleteProject = currentUserRole === "owner";

  // ===== NEXVORA Readiness (P3 6-metric system) =====
  // نحسب على الفور بدون snapshots — الـ workflow_v2 checklist state لسه
  // ما اتربطش تلقائيًا، فلحد ما ده يحصل هنعرض 0% صريحة (ما نخفيش الحاجة).
  // بمجرد ما مرحلة v2 checklist item يتحدّث → نسبها تظهر هنا فورًا.
  const nexvoraReadinessMetrics = workflowV2Enabled
    ? computeAllReadiness({})
    : [];
  const nexvoraOverallReadiness = workflowV2Enabled
    ? computeOverallReadiness(nexvoraReadinessMetrics)
    : 0;
  const allUsersForWork = ((allUsersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((u) => ({ id: u.id, name: u.full_name || u.email || "مستخدم" }));
  const workMembersForBoard = workMembers.map((m) => ({ user_id: m.user_id, name: m.name }));
  const milestonesSummary = workMilestones.length > 0
    ? {
        total: workMilestones.length,
        approved: workMilestones.filter((m) => m.approval_status === "approved").length,
        avgProgress: Math.round(workMilestones.reduce((a, m) => a + m.progress_pct, 0) / workMilestones.length),
        latestUpdatedAt: workMilestones.map((m) => m.updated_at).sort().reverse()[0] ?? null,
      }
    : null;

  const workflowStageStates = buildWorkflowStageStates({
    discoveryForm,
    milestonesSummary,
    knowledgeHubSummary,
    discoveryAnalysis: discoveryAnalysis as { status: string; last_error?: string | null; finished_at: string | null } | null,
    meetingPrep: meetingPrep as { status: string; version: number; updated_at: string } | null,
    meetingPresentationDraft: meetingPresentationDraft as {
      status: string;
      version: number;
      last_error: string | null;
      updated_at: string;
    } | null,
    meetingsCount: (meetings ?? []).length,
    brainV2Latest: brainV2Latest,
    brainV2Approved: brainV2Approved,
    brainV2Reviewable: brainV2Reviewable,
    recommendations: recommendations.map((r) => ({ status: r.status })),
    prd,
    prototypePrompt,
    review,
    developerHandoff,
    clientPresentation: presentation
      ? {
          status: presentation.status,
          version: presentation.version,
          last_error: presentation.last_error,
          updated_at: presentation.updated_at,
          generated_from_prd_version: presentation.generated_from_prd_version,
          generated_from_review_version: presentation.generated_from_review_version,
        }
      : null,
    currentExecutionPlan,
    latestEngineeringQaFixLoop,
    engineeringCurrentReview: engineeringQAState.currentReview,
    productionCurrentCheck: productionMonitoringState.currentCheck,
    openMonitoringIncidents,
    pendingFixPrompts: productionMonitoringState.fixPrompts.map((p) => ({ incident_id: p.incident_id, status: p.status })),
    latestMonitoringReviewReport: productionMonitoringState.latestReviewReport
      ? { overall_fix_score: productionMonitoringState.latestReviewReport.overall_fix_score, generated_at: productionMonitoringState.latestReviewReport.generated_at }
      : null,
    advisorAnalysis: advisorAnalysis as { status: string; updated_at?: string } | null,
    widgetKey: project.widget_key,
    openSupportRequestsCount,
  });
  const workflowStaleness = computeStaleness(workflowStageStates);
  const workflowReadiness = calculateReadiness(workflowStageStates);

  const engineeringReviewScoreLabel = engineeringQAState.currentReview
    ? `تقدّم Engineering QA: ${Math.round(engineeringQAState.currentReview.overall_progress)}% — الحالة: ${engineeringQAState.currentReview.review_status}`
    : "لا توجد مراجعة Engineering QA بعد.";
  const productionReviewScoreLabel = productionMonitoringState.currentCheck
    ? `آخر فحص إنتاج: ${productionMonitoringState.currentCheck.overall_status ?? "—"} — الحالة: ${productionMonitoringState.currentCheck.status}`
    : "لا يوجد فحص إنتاج بعد.";

  // ترتيب المراحل مصدره STAGE_REGISTRY حصرًا (lib/workflow/registry.ts)
  // — مفيش أي Array ترتيب تاني هنا، بس تجميع المحتوى الفعلي (Content)
  // لكل مفتاح، عشان WorkflowNav يرتّبهم زي ما هو متعرّف في الـ Registry.
  const stageContentByKey: Partial<Record<(typeof STAGE_REGISTRY)[number]["id"], React.ReactNode>> = {
    overview: (
      <>
        <div className="mb-6">
          <ManualNoteComposer projectId={project.id} />
        </div>
        <div className="mb-6">
          <AnalysisPanel projectId={project.id} initialAnalysis={project.ai_analysis} />
        </div>
        <ProjectBrainEntries projectId={project.id} entries={brainEntries ?? []} />
      </>
    ),
    discovery: (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!isLegacyForm && currentTemplate ? (
            <DiscoverySection
              projectId={project.id}
              templates={discoveryTemplates}
              currentTemplate={currentTemplate}
              questions={templateQuestions}
              existingForm={discoveryForm}
              isAdmin={isAdmin}
            />
          ) : (
            <DiscoveryFormEditor projectId={project.id} projectType={project.project_type} existingForm={discoveryForm} />
          )}
          <DiscoverySessionsPanel
            projectId={project.id}
            sessions={discoverySessions}
            templates={discoveryTemplates}
            isAdmin={isAdmin}
          />
        </div>
        <div className="space-y-6">
          <DiscoveryGeneratorPanel
            isAdmin={isAdmin}
            activeTemplate={
              currentTemplate
                ? {
                    id: currentTemplate.id,
                    name: currentTemplate.name,
                    isAiGenerated: currentTemplate.source === "ai_generated",
                  }
                : null
            }
          />
        </div>
      </div>
    ),
    analysis: (
      <DiscoveryAnalysisPanel projectId={project.id} analysis={(discoveryAnalysis as DiscoveryAnalysisRow | null) ?? null} isAdmin={isAdmin} />
    ),
    meetingPreparation: (
      <MeetingPrepPanel
        projectId={project.id}
        prep={(meetingPrep as MeetingPreparationRow | null) ?? null}
        participants={(meetingPrepParticipants as MeetingPrepParticipant[] | null) ?? []}
        requiredItems={(meetingRequiredItems as MeetingRequiredItem[] | null) ?? []}
        attachments={(meetingPrepAttachments as MeetingAttachment[] | null) ?? []}
        isAdmin={isAdmin}
      />
    ),
    meetingPresentation: (
      <MeetingPresentationPanel projectId={project.id} draft={meetingPresentationDraft} history={meetingPresentationHistory} />
    ),
    meetings: <MeetingsPanel projectId={project.id} projectCode={project.project_code} meetings={meetings ?? []} />,
    projectBrain: (
      <div className="space-y-6">
        <ArchitecturalRecommendationsSummary
          projectId={project.id}
          recommendations={recommendations}
          architectureReport={architectureReport}
          canManage={isAdmin}
        />
        <PendingChangesPanel projectId={project.id} pendingChanges={brainPendingChanges} canManage={isAdmin} />
        <KnowledgeGraphPanel
          projectId={project.id}
          nodes={knowledgeGraphState.nodes}
          relations={knowledgeGraphState.relations}
          latestReport={knowledgeGraphState.latestReport}
          domain={knowledgeGraphState.domain}
          isAdmin={isAdmin}
        />
        <KnowledgeGraphViewer edges={brainKnowledgeGraph} />
        {brainV2Latest && (
          <BrainOpenItemsPanel
            projectId={project.id}
            documentId={brainV2Latest.id}
            content={brainV2Latest.content}
            missingDispositions={brainV2Latest.missing_info_dispositions ?? {}}
            assumptionDispositions={brainV2Latest.assumption_dispositions ?? {}}
            canReview={isAdmin}
            editable={brainV2Latest.status === "draft" || brainV2Latest.status === "in_review"}
          />
        )}
        <BrainV2Panel
          projectId={project.id}
          document={brainV2Latest}
          approvedDocument={brainV2Approved}
          versions={brainV2Versions}
          isAdmin={isAdmin}
        />
        <details className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
          <summary className="cursor-pointer text-xs text-[var(--v-text-muted)]">عرض Brain القديم (Legacy — للمرحلة الانتقالية)</summary>
          <div className="mt-3">
            <BrainPanel projectId={project.id} brain={brain} />
          </div>
        </details>
      </div>
    ),
    smartRecommendations: (
      <div className="space-y-5">
        <SmartRecommendationsPanel
          projectId={project.id}
          recommendations={recommendations}
          dependencies={recommendationDependencies}
          canManage={isAdmin}
        />
        <ArchitectureIntelligencePanel
          projectId={project.id}
          initialReport={architectureReport}
          canManage={isAdmin}
        />
      </div>
    ),
    brainReview: (
      <div className="space-y-6">
        <ArchitecturalRecommendationsSummary
          projectId={project.id}
          recommendations={recommendations}
          architectureReport={architectureReport}
          canManage={isAdmin}
        />
        <BrainReviewPanel
        projectId={project.id}
        document={brainV2Reviewable}
        confidenceThreshold={brainSettings.confidence_threshold_percent}
        isAdmin={isAdmin}
        recommendations={recommendations}
        reviewObjects={brainReviewV2State.objects}
        reviewDependencies={brainReviewV2State.dependencies}
        reviewComments={brainReviewV2State.comments}
        latestValidationReport={brainReviewV2State.latestValidationReport}
        reviewEvents={brainReviewV2State.events}
        />
      </div>
    ),
    knowledgeHub: (
      <KnowledgeHubPanel
        projectId={project.id}
        batches={knowledgeBatches}
        sources={knowledgeSources}
        items={knowledgeItems}
        gaps={knowledgeGaps}
        relations={knowledgeRelations}
        conflicts={knowledgeConflicts}
      />
    ),
    prd: (
      <div className="flex flex-col gap-[var(--v-space-6)]">
        <PRDPanel projectId={project.id} projectName={project.name} prd={prd} currentBrainVersion={brainV2ForGeneration?.version ?? null} />
        <IncrementsPanel
          projectId={project.id}
          increments={projectIncrements}
          sections={prdIncrementSections}
        />
      </div>
    ),
    prototypeStudio: (
      prototypeStudioEnabled && studioConfig ? (
        <PrototypeStudioPanel
          projectId={project.id}
          projectName={project.name}
          initialConfig={studioConfig}
          latestContextPack={studioLatestContextPack}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--v-border)] p-8 text-center text-sm text-[var(--v-text-secondary)]">
          Prototype Studio معطّل بفلاغ الميزة. فعّله من إعدادات النظام.
        </div>
      )
    ),
    prototypePrompt: (
      <PrototypePromptPanel
        projectId={project.id}
        projectName={project.name}
        prompt={prototypePrompt}
        currentPrdVersion={prd?.version ?? null}
        currentBrainVersion={brainV2ForGeneration?.version ?? null}
        pipelinePlan={pipelinePlan}
        pipelineStages={pipelineStages ?? []}
      />
    ),
    prototypeReview: (
      <ReviewPanel projectId={project.id} projectName={project.name} review={review} currentPrdVersion={prd?.version ?? null} />
    ),
    clientDelivery: (
      <PresentationPanel
        projectId={project.id}
        projectName={project.name}
        presentation={presentation}
        currentBrainVersion={brainV2ForGeneration?.version ?? null}
        currentPrdVersion={prd?.version ?? null}
        currentReviewVersion={review?.version ?? null}
      />
    ),
    promptReview: (
      <CodeExecutionPanel
        projectId={project.id}
        initialState={{
          plans: executionPlans,
          currentPlan: currentExecutionPlan,
          tasks: executionTasks,
          qaFixLoops: qaFixLoops ?? [],
          accessibilityScans: accessibilityScans ?? [],
          releaseCandidate: releaseCandidate ?? null,
        }}
      />
    ),
    developerHandoff: (
      <DeveloperHandoffPanel
        projectId={project.id}
        projectName={project.name}
        handoff={developerHandoff}
        currentPrdVersion={prd?.version ?? null}
        currentReviewVersion={review?.version ?? null}
        currentBrainVersion={brainV2ForGeneration?.version ?? null}
      />
    ),
    engineeringQa: (
      <EngineeringQAPanel
        projectId={project.id}
        reviews={engineeringQAState.reviews}
        currentReview={engineeringQAState.currentReview}
        stages={engineeringQAState.stages}
        results={engineeringQAState.results}
        certificate={engineeringQAState.certificate}
        events={engineeringQAState.events}
        staticReview={staticReviewState}
        securityReview={securityReviewState}
        databaseReview={databaseReviewState}
        architectureReview={architectureReviewState}
        codeQualityReview={codeQualityReviewState}
        performanceReview={performanceReviewState}
        prdComplianceReview={prdComplianceReviewState}
        productionValidation={{ stagingUrl: project.staging_url ?? "", ...productionValidationState }}
      />
    ),
    fixPrompt: <FixPromptPanel qaFixLoops={(qaFixLoops ?? []).filter((l) => l.qa_stage === "engineering_qa")} executionTasks={executionTasks} />,
    engineeringQaReview: (
      <QaReviewGatePanel
        kind="engineering"
        projectId={project.id}
        targetId={engineeringQAState.currentReview?.id ?? null}
        scoreLabel={engineeringReviewScoreLabel}
        canApprove={isAdmin}
        decisionStatus={engineeringQAState.currentReview?.pm_approval_status ?? null}
        decisionAt={engineeringQAState.currentReview?.pm_approved_at ?? null}
        readyToReview={
          engineeringQAState.currentReview?.review_status === "completed" || engineeringQAState.currentReview?.review_status === "certified"
        }
      />
    ),
    productionMonitoring: (
      <ProductionMonitoringPanel
        projectId={project.id}
        productionUrl={project.production_url ?? ""}
        checks={productionMonitoringState.checks}
        currentCheck={productionMonitoringState.currentCheck}
        incidents={productionMonitoringState.incidents}
        events={productionMonitoringState.events}
        infraStatus={productionMonitoringState.infraStatus}
      />
    ),
    productionMonitoringPrompt: (
      <ProductionMonitoringPromptPanel
        projectId={project.id}
        incidents={productionMonitoringState.incidents}
        fixPrompts={productionMonitoringState.fixPrompts}
      />
    ),
    productionMonitoringReview: (
      <>
        <QaReviewGatePanel
          kind="production"
          projectId={project.id}
          targetId={productionMonitoringState.currentCheck?.id ?? null}
          scoreLabel={productionReviewScoreLabel}
          canApprove={isAdmin}
          decisionStatus={productionMonitoringState.currentCheck?.pm_approval_status ?? null}
          decisionAt={productionMonitoringState.currentCheck?.pm_approved_at ?? null}
          readyToReview={productionMonitoringState.currentCheck?.status === "ready"}
        />
        <ProductionReviewVerdictPanel
          projectId={project.id}
          incidents={productionMonitoringState.incidents}
          latestReport={productionMonitoringState.latestReviewReport}
        />
      </>
    ),
    organizationalIntelligence: (
      <OrganizationalIntelligencePanel
        projectId={project.id}
        decisionMemory={decisionMemory}
        extractionJob={extractionJob}
        advisorAnalysis={advisorAnalysis}
      />
    ),
    support: <SupportPanel projectId={project.id} widgetKey={project.widget_key} requests={supportRequests ?? []} teamMembers={teamMembers ?? []} />,
  };

  const deliveryMilestonesContent = (
    <DeliveryLifecyclePanel
      projectId={project.id}
      projectName={project.name}
      role={currentUserRole}
      milestones={workMilestones}
      members={workMembers}
      allUsers={allUsersForWork}
    />
  );
  const tasksTabContent = (
    <WorkPanel
      projectId={project.id}
      currentUserId={user?.id ?? ""}
      role={currentUserRole}
      members={workMembersForBoard}
      milestones={workMilestones}
    />
  );

  const workflowItems: WorkflowNavItem[] = [
    ...STAGE_REGISTRY.slice()
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        key: stage.id,
        label: stage.displayName,
        content: stage.id === "deliveryMilestones" ? deliveryMilestonesContent : (stageContentByKey[stage.id] ?? null),
      })),
    { key: "tasks", label: "المهام", content: tasksTabContent },
    // تبويبات NEXVORA — يظهروا بس لو product_mode مفعّل (NEXVORA Core).
    // "البحث والتحقق" قبل "تجاري" لأنه أساس تعريف المنتج (P5 → P6+).
    ...(workflowV2Enabled ? [
      {
        key: "research",
        label: "البحث والتحقق",
        content: (
          <ResearchPanel
            projectId={project.id}
            marketResearch={marketResearchItems}
            problemValidation={problemValidationItems}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "definition",
        label: "تعريف المنتج",
        content: (
          <DefinitionPanel
            projectId={project.id}
            personas={definitionPersonas}
            flows={definitionFlows}
            requirements={definitionRequirements}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "stories",
        label: "القصص والقبول",
        content: (
          <StoriesPanel
            projectId={project.id}
            stories={storiesRows}
            acs={acceptanceCriteriaRows}
            personas={definitionPersonas}
            flows={definitionFlows}
            requirements={definitionRequirements}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "traceability",
        label: "الأدلة والربط",
        content: (
          <TraceabilityPanel
            projectId={project.id}
            requirements={definitionRequirements}
            stories={storiesRows}
            acs={acceptanceCriteriaRows}
            marketResearch={marketResearchItems}
            problemValidation={problemValidationItems}
            evidenceLinks={evidenceLinkRows}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "evaluation",
        label: "دليل التقييم",
        content: (
          <EvaluationPanel
            projectId={project.id}
            scenarios={evalScenarios}
            runs={evalRunsRows}
            stories={storiesRows}
            flows={definitionFlows}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "impact",
        label: "أثر التغيير",
        content: (
          <ChangeImpactPanel
            requirements={definitionRequirements}
            stories={storiesRows}
            acs={acceptanceCriteriaRows}
            scenarios={evalScenarios}
            evidence={evidenceLinkRows}
          />
        ),
      },
      {
        key: "decisions",
        label: "سجل القرارات",
        content: (
          <DecisionsPanel
            projectId={project.id}
            items={decisionItemsRows}
            requirements={definitionRequirements}
            stories={storiesRows}
            evidenceCounts={(() => {
              const m: Record<string, number> = {};
              for (const link of evidenceLinkRows) {
                if (link.sourceType === "product_decision_item") {
                  m[link.sourceId] = (m[link.sourceId] ?? 0) + 1;
                }
              }
              return m;
            })()}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "stageOwners",
        label: "مسؤولو المراحل",
        content: (
          <StageOwnersPanel
            projectId={project.id}
            assignments={stageAssignmentsRows}
            users={allUsersForWork}
            decisions={decisionItemsRows}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "approvals",
        label: "اعتماد العميل",
        content: (
          <ClientApprovalPanel
            projectId={project.id}
            approvals={clientApprovalsRows}
            baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "handoff",
        label: "حزمة التسليم",
        content: (
          <HandoffPanel
            projectId={project.id}
            packages={handoffPackagesRows}
            items={handoffItemsRows}
            latestPackage={latestHandoffPackage}
            canWrite={canWriteCommercial}
            questions={handoffQuestionsRows}
            deliveries={handoffDeliveriesRows}
            partners={externalPartnersRows}
          />
        ),
      },
      {
        key: "partners",
        label: "شركاء خارجيون",
        content: (
          <PartnersPanel
            projectId={project.id}
            partners={externalPartnersRows}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "commercial-full",
        label: "عروض وتغيير",
        content: (
          <CommercialFullPanel
            projectId={project.id}
            proposals={proposalsRows}
            proposalItems={proposalItemsRows}
            changeRequests={changeRequestsRows}
            pricingPackages={pricingPackagesRows}
            contracts={commercialContracts}
            canWrite={canWriteCommercial}
          />
        ),
      },
      {
        key: "commercial",
        label: "تجاري",
        content: (
          <CommercialPanel
            projectId={project.id}
            lifecycle={commercialLifecycle}
            contracts={commercialContracts}
            payments={commercialPayments}
            canWrite={canWriteCommercial}
            nowISO={new Date().toISOString()}
          />
        ),
      },
    ] : []),
    { key: "activity", label: "Activity", content: <ActivityPanel entries={timeline} /> },
  ];

  // NEXVORA UX Cleanup: لما product_mode مفعّل، نعيد ترتيب التبويبات في 8
  // مراحل أساسية (+ phase التنفيذ التاسعة خلف Extended flag) بدل الترتيب
  // المُختلط (v1 + v2). المشاريع اللي مش في وضع product_mode تفضل بترتيب
  // STAGE_REGISTRY القديم بلا لمس.
  // NEXVORA UX Cleanup 2: كل تبويبة بياخد category (essential/advanced) من
  // خريطة nexvora-tab-order. WorkflowNav بيخفي "advanced" خلف زر «إظهار
  // المتقدمة» — أي مفتاح مش موجود في الخريطة بيعتبر essential (fallback آمن).
  // Extended Technical Delivery: تبويبات phase الـ execution مخفية بلا الفلاغ
  // حتى لو المستخدم فعّل "إظهار المتقدمة" (لأنها مش مجرد "متقدم" بل قسم
  // Extended كامل). استثناء واحد: deep-link مباشر على تبويب execution يعرضه
  // (backwards compat) لكن الـ phase pill يظل مخفي على أي حال.
  const visibleNexvoraPhases = getVisibleNexvoraPhases(extendedEnabled);
  const visibleNexvoraPhaseKeys = new Set(visibleNexvoraPhases.map((p) => p.key));
  // Security: تبويبات execution محجوبة تمامًا لما الفلاغ off. لا استثناء
  // deep-link هنا — الـ redirect فوق تكفّل بالحماية على مستوى الرابط،
  // وهنا نضمن الحجب على مستوى الـ Navigation بحيث ما يظهرش أي زر ولا Pill.
  const nexvoraFilteredWorkflowItems = workflowV2Enabled && !extendedEnabled
    ? workflowItems.filter((i) => !EXTENDED_TAB_KEYS.has(i.key))
    : workflowItems;

  const orderedWorkflowItems: WorkflowNavItem[] = workflowV2Enabled
    ? orderTabsByNexvora(nexvoraFilteredWorkflowItems).map((o) => ({ ...o.item, category: o.category }))
    : workflowItems.map((i) => ({ ...i, category: getTabCategory(i.key) }));

  // اسماء الـ phases لعرضها كـ "قفزة سريعة" فوق التبويبات (حصريًا للـ v2).
  // الـ pills تحترم extendedEnabled فقط — لو الفلاغ متعطّل، phase التنفيذ
  // ما تبانش كـ pill حتى لو المستخدم فتح تبويب منها بالـ deep-link.
  const nexvoraPhaseAnchors = workflowV2Enabled
    ? orderTabsByNexvora(nexvoraFilteredWorkflowItems).reduce<Array<{ phaseKey: string; phaseLabel: string; firstTabKey: string }>>(
        (acc, o) => {
          if (!visibleNexvoraPhaseKeys.has(o.phaseKey)) return acc;
          if (!acc.find((a) => a.phaseKey === o.phaseKey)) {
            acc.push({ phaseKey: o.phaseKey, phaseLabel: o.phaseLabel, firstTabKey: o.item.key });
          }
          return acc;
        },
        [],
      )
    : [];

  return (
    <div>
      <nav aria-label="مسار التنقل" className="mb-3 flex items-center gap-1.5 text-xs text-[var(--v-text-muted)]">
        <Link href="/dashboard/projects" className="hover:text-[var(--v-primary)] hover:underline">
          المشاريع
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--v-text-secondary)]">{project.name}</span>
      </nav>

      <div className="hud-frame mb-6 rounded-[var(--v-radius-lg)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-display text-[var(--v-text)]">{project.name}</h1>
            <p className="text-sm text-[var(--v-text-secondary)]">
              {/* @ts-expect-error clients هو علاقة متداخلة من Supabase */}
              {project.clients?.company_name || "—"} · {project.project_type}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ArchiveButton
                table="projects"
                id={project.id}
                revalidateHref="/dashboard/projects"
                confirmMessage="أرشفة المشروع هتخفيه من كل القوائم لكن كل بياناته (Brain, PRD, Meetings, Support...) هتفضل محفوظة في القاعدة. الأرشفة قابلة للتراجع."
              />
              {canDeleteProject && (
                <DeleteProjectButton projectId={project.id} projectName={project.name} />
              )}
            </div>
            {isDirector && <PromoteExperienceButton projectId={project.id} />}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--v-border)] pt-3 text-xs text-[var(--v-text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span>المرحلة:</span>
            {canWriteCommercial ? (
              <StageSelector currentStage={project.stage} projectId={project.id} />
            ) : (
              <b className="font-mono-plex font-semibold text-[var(--v-text)]">{stageLabels[project.stage] || project.stage}</b>
            )}
          </span>
          <span>
            المسؤول: <b className="font-mono-plex font-semibold text-[var(--v-text)]">{owner?.full_name || owner?.email || "—"}</b>
          </span>
          <span>
            آخر نشاط:{" "}
            <b className="font-mono-plex font-semibold text-[var(--v-text)]">
              {new Date(project.stage_changed_at).toLocaleDateString("ar-EG")}
            </b>
          </span>
        </div>
      </div>

      {/* ملخص جاهزية:
          - product_mode مفعّل → 6 مقاييس NEXVORA الجديدة (Discovery/
            Validation/Definition/Prototype/Approval/Handoff)
          - غير كده → 4 مقاييس Workflow v1 القديمة (backwards compat)
          مصدر الحقيقة الوحيد: lib/project-readiness (v2) أو
          lib/workflow/progress-engine (v1). */}
      {workflowV2Enabled ? (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-[var(--v-text-muted)]">
            <span>مقاييس الجاهزية (NEXVORA v2)</span>
            <span>
              الجاهزية العامة:{" "}
              <b className="font-mono-plex text-[var(--v-text)]">{nexvoraOverallReadiness}%</b>
            </span>
          </div>
          {(overdueStagesCount > 0 || criticalOpenRisksCount > 0) && (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-2 text-xs">
              {overdueStagesCount > 0 && (
                <span className="text-[var(--v-red)]">
                  مراحل متأخرة: <b className="font-mono-plex">{overdueStagesCount}</b>
                </span>
              )}
              {criticalOpenRisksCount > 0 && (
                <span className="text-[var(--v-red)]">
                  مخاطر حرجة مفتوحة: <b className="font-mono-plex">{criticalOpenRisksCount}</b>
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {nexvoraReadinessMetrics.map((m) => (
              <div
                key={m.metric}
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3"
              >
                <p className="text-[11px] leading-tight text-[var(--v-text-muted)]">
                  {READINESS_METRICS_ORDERED.find((d) => d.key === m.metric)?.displayName ?? m.metric}
                </p>
                <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">{m.percentage}%</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["الجاهزية العامة", workflowReadiness.overall],
            ["الجاهزية الهندسية", workflowReadiness.engineering],
            ["جاهزية النشر", workflowReadiness.deployment],
            ["جاهزية الدعم", workflowReadiness.support],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
            <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
            <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">{value}%</p>
          </div>
        ))}
      </div>
      )}

      {/* NEXVORA Phase Anchors — قفزة سريعة بين المجموعات الثمانية
          (يظهر فقط لما product_mode مفعّل، عدد التبويبات في كل phase مكتوب بجانب اسمها). */}
      {workflowV2Enabled && nexvoraPhaseAnchors.length > 0 && (
        <nav aria-label="مراحل المشروع" className="mb-3 flex flex-wrap items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2 text-xs">
          <span className="px-1 font-semibold text-[var(--v-text-muted)]">القفزة السريعة:</span>
          {nexvoraPhaseAnchors.map((p) => (
            <a
              key={p.phaseKey}
              href={`?tab=${p.firstTabKey}`}
              className="rounded-full border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-0.5 text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
            >
              {p.phaseLabel}
            </a>
          ))}
        </nav>
      )}

      <WorkflowNav items={orderedWorkflowItems} stageStates={workflowStageStates} staleness={workflowStaleness} projectId={project.id} />
    </div>
  );
}
