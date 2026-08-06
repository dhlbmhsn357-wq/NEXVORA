import type { StageState, WorkflowStageKey } from "./types";
import { adaptKnowledgeHubStage, type KnowledgeHubSummary } from "./adapters/knowledge-hub";
import { adaptOverviewStage, adaptDiscoveryStage, adaptAnalysisStage } from "./adapters/discovery";
import { adaptMeetingPreparationStage, adaptMeetingPresentationStage, adaptMeetingsStage } from "./adapters/meetings";
import { adaptProjectBrainStage, adaptSmartRecommendationsStage, adaptBrainReviewStage } from "./adapters/brain";
import { adaptDeliveryMilestonesStage } from "./adapters/delivery-milestones";
import {
  adaptPrdStage,
  adaptPrototypePromptStage,
  adaptPrototypeReviewStage,
  adaptPromptReviewStage,
  adaptDeveloperHandoffStage,
  adaptClientDeliveryStage,
} from "./adapters/delivery";
import { adaptEngineeringQaStage, adaptFixPromptStage, adaptEngineeringQaReviewStage } from "./adapters/engineering";
import { adaptProductionMonitoringStage, adaptProductionMonitoringPromptStage, adaptProductionMonitoringReviewStage } from "./adapters/production";
import { adaptOrganizationalIntelligenceStage, adaptSupportStage } from "./adapters/closing";

/**
 * الدالة الوحيدة اللي page.tsx بيستدعيها — بتلف كل الـ Adapters
 * الفردية وترجّع StageState لكل مرحلة من الـ 22. مفيش أي منطق جديد
 * هنا غير التجميع؛ كل قرار حالة فعلي موجود جوّه adapters/*.ts (Pure،
 * قابلة للاختبار كل واحدة لوحدها).
 */
export interface WorkflowRawData {
  discoveryForm: { status: string } | null;
  discoveryAnalysis: { status: string; last_error?: string | null; finished_at: string | null } | null;
  meetingPrep: { status: string; version: number; updated_at: string } | null;
  meetingPresentationDraft: { status: string; version: number; last_error: string | null; updated_at: string } | null;
  meetingsCount: number;
  milestonesSummary: { total: number; approved: number; avgProgress: number; latestUpdatedAt: string | null } | null;
  knowledgeHubSummary: KnowledgeHubSummary | null;
  brainV2Latest: { status: string; version: number; completeness_score: number; updated_at: string } | null;
  brainV2Approved: { status: string; version: number; completeness_score: number; updated_at: string } | null;
  brainV2Reviewable: { status: string; version: number; completeness_score: number; updated_at: string } | null;
  recommendations: { status: string }[];
  prd: { sync_status: string; version: number; last_error: string | null; updated_at: string; generated_from_brain_version: number | null } | null;
  prototypePrompt: {
    sync_status: string;
    version: number;
    last_error: string | null;
    updated_at: string;
    generated_from_prd_version: number | null;
  } | null;
  review: { sync_status: string; version: number; last_error: string | null; updated_at: string; reviewed_prompt_version: number | null } | null;
  developerHandoff: {
    sync_status: string;
    version: number;
    last_error: string | null;
    updated_at: string;
    generated_from_prd_version: number | null;
    generated_from_review_version: number | null;
  } | null;
  clientPresentation: {
    status: "idle" | "generating" | "failed";
    version: number;
    last_error: string | null;
    updated_at: string;
    generated_from_prd_version: number | null;
    generated_from_review_version: number | null;
  } | null;
  currentExecutionPlan: {
    status: string;
    prototype_prompt_version: number;
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    last_error: string | null;
    updated_at: string;
  } | null;
  latestEngineeringQaFixLoop: { status: string; fix_prompt: string | null; fix_task_id: string | null; attempt_number: number; updated_at: string } | null;
  engineeringCurrentReview: {
    review_status: string;
    overall_progress: number;
    last_error: string | null;
    updated_at: string;
    pm_approval_status?: "approved" | "rejected" | null;
    pm_approved_at?: string | null;
  } | null;
  productionCurrentCheck: {
    status: string;
    overall_status: string | null;
    last_error: string | null;
    updated_at: string;
    pm_approval_status?: "approved" | "rejected" | null;
    pm_approved_at?: string | null;
  } | null;
  openMonitoringIncidents: { id: string; status: string; root_cause: string; patch_proposal: string; last_seen_at: string }[];
  pendingFixPrompts: { incident_id: string; status: string }[];
  latestMonitoringReviewReport: { overall_fix_score: number | null; generated_at: string } | null;
  advisorAnalysis: { status: string; updated_at?: string } | null;
  widgetKey: string | null;
  openSupportRequestsCount: number;
}

export function buildWorkflowStageStates(data: WorkflowRawData): Partial<Record<WorkflowStageKey, StageState>> {
  return {
    overview: adaptOverviewStage(),
    discovery: adaptDiscoveryStage(data.discoveryForm),
    analysis: adaptAnalysisStage(data.discoveryAnalysis),
    meetingPreparation: adaptMeetingPreparationStage(data.meetingPrep),
    meetingPresentation: adaptMeetingPresentationStage(data.meetingPresentationDraft),
    meetings: adaptMeetingsStage(data.meetingsCount),
    deliveryMilestones: adaptDeliveryMilestonesStage(data.milestonesSummary),
    knowledgeHub: adaptKnowledgeHubStage(data.knowledgeHubSummary),
    projectBrain: adaptProjectBrainStage(data.brainV2Latest, data.brainV2Approved),
    smartRecommendations: adaptSmartRecommendationsStage(data.recommendations),
    brainReview: adaptBrainReviewStage(data.brainV2Reviewable),
    prd: adaptPrdStage(data.prd, data.brainV2Approved?.version ?? data.brainV2Latest?.version ?? null),
    prototypePrompt: adaptPrototypePromptStage(data.prototypePrompt, data.prd?.version ?? null),
    prototypeReview: adaptPrototypeReviewStage(data.review, data.prototypePrompt?.version ?? null),
    promptReview: adaptPromptReviewStage(data.currentExecutionPlan, data.prototypePrompt?.version ?? null),
    developerHandoff: adaptDeveloperHandoffStage(data.developerHandoff, data.prd?.version ?? null, data.review?.version ?? null),
    clientDelivery: adaptClientDeliveryStage(data.clientPresentation, data.prd?.version ?? null, data.review?.version ?? null),
    engineeringQa: adaptEngineeringQaStage(data.engineeringCurrentReview),
    fixPrompt: adaptFixPromptStage(data.latestEngineeringQaFixLoop),
    engineeringQaReview: adaptEngineeringQaReviewStage(data.engineeringCurrentReview),
    productionMonitoring: adaptProductionMonitoringStage(data.productionCurrentCheck),
    productionMonitoringPrompt: adaptProductionMonitoringPromptStage(data.openMonitoringIncidents, data.pendingFixPrompts),
    productionMonitoringReview: adaptProductionMonitoringReviewStage(data.productionCurrentCheck, data.latestMonitoringReviewReport),
    organizationalIntelligence: adaptOrganizationalIntelligenceStage(data.advisorAnalysis),
    support: adaptSupportStage(data.widgetKey, data.openSupportRequestsCount),
  };
}
