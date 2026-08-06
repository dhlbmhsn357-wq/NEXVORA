/**
 * Workflow Engine (Phase 1) — الطبقة الجديدة اللي بتوصف دورة حياة
 * المشروع كـ Registry مُهيّأ بدل ما تكون الترتيب/التبعيات مكتوبة جوّه
 * project-tabs.tsx. الطبقة دي تُقرأ فوق الـ 20 محرك الحالي (PRD،
 * Prototype Prompt، Engineering QA، ...) من غير ما تلمس أي واحد فيهم —
 * كل محرك فاضل شغّال بنفس الجداول ونفس منطق الـ status بتاعه، والـ
 * Workflow Engine بس بيترجم حالته لصيغة موحّدة عبر Adapter مخصص له.
 */

/** الـ 22 مرحلة بالترتيب المطلوب بالظبط. */
export type WorkflowStageKey =
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
 * حالة موحّدة عبر كل المراحل — كل محرك حالي بيستخدم مفردات مختلفة
 * (idle/generating/failed، generating/ready/failed،
 * pending/queued/running/completed/failed/cancelled...). الـ Adapter
 * الخاص بكل محرك هو المسؤول عن ترجمة حالته الحقيقية لواحدة من دول.
 */
export type WorkflowStatus =
  | "not_started"
  | "in_progress"
  | "waiting_ai"
  | "waiting_review"
  | "needs_regeneration"
  | "approved"
  | "rejected"
  | "completed"
  | "archived";

/** الأدوار المدعومة على مستوى الـ Type — التفعيل الفعلي موضّح في permissions.ts. */
export type WorkflowRole = "admin" | "pm" | "reviewer" | "developer" | "qa" | "support";

export type WorkflowAction = "view" | "edit" | "approve" | "regenerate" | "archive";

export interface StageDefinition {
  id: WorkflowStageKey;
  slug: string;
  displayName: string;
  description: string;
  /** اسم أيقونة من lucide-react (مطابق للمكتبة المستخدمة في باقي الواجهة). */
  icon: string;
  order: number;
  /** المراحل اللي المرحلة دي بتعتمد على مخرجاتها — تُستخدم في dependency-graph.ts. */
  dependencies: WorkflowStageKey[];
  entryConditions: string;
  exitConditions: string;
  permissions: Record<WorkflowAction, WorkflowRole[]>;
}

export interface VersionInfo {
  /** المصدر اللي اتولّد منه المحتوى (مثلاً "projectBrain") أو null لو مفيش تتبّع تبعية. */
  generatedFrom: WorkflowStageKey | null;
  /** نسخة المرحلة الحالية نفسها (null لو المرحلة أصلاً مالهاش رقم نسخة). */
  version: number | null;
  generatedAt: string | null;
  /** نسخة المصدر (generatedFrom) وقت التوليد — تُقارن بالنسخة الحالية لتحديد isStale. */
  parentVersion: number | null;
  isStale: boolean;
  staleReason: string | null;
}

export interface StageState {
  key: WorkflowStageKey;
  status: WorkflowStatus;
  /** 0-100 */
  completionPct: number;
  versionInfo: VersionInfo;
  lastError: string | null;
  updatedAt: string | null;
}

export const NEUTRAL_VERSION_INFO: VersionInfo = {
  generatedFrom: null,
  version: null,
  generatedAt: null,
  parentVersion: null,
  isStale: false,
  staleReason: null,
};
