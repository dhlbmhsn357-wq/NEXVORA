/**
 * هذه الأنواع تعكس جداول Phase 1 بالضبط كما في
 * supabase/migrations/0001_phase1_schema.sql
 * أي تعديل في الـ schema يجب أن ينعكس هنا أيضًا.
 */

/**
 * الأدوار (Enterprise IAM — migration 0059) بترتيب هرمي:
 * owner (مسؤول النظام) > admin (مسؤول) > supervisor (مشرف) > member (منفّذ).
 */
export type UserRole = "owner" | "admin" | "supervisor" | "member";

/** حالة حساب المستخدم (migration 0059). غير active = ممنوع من الدخول. */
export type UserStatus = "active" | "inactive" | "locked" | "suspended" | "pending" | "deleted";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  failed_login_count: number;
  locked_at: string | null;
  created_at: string;
}

/** صف من login_attempts (migration 0059) — سجل محاولات الدخول. */
export interface LoginAttempt {
  id: string;
  email: string;
  ip: string | null;
  user_agent: string | null;
  success: boolean;
  created_at: string;
}

// ===== Collaboration Hub (migration 0060) =====

export type ConversationType = "direct" | "project" | "department" | "announcement";
/** قنوات المشروع الفرعية الثابتة. */
export type ProjectChannelKey = "general" | "development" | "design" | "testing" | "deployment" | "support";
export type MessagePriority = "normal" | "high" | "urgent";
export type MentionType = "user" | "admins" | "managers" | "project_team" | "department";

export interface Conversation {
  id: string;
  type: ConversationType;
  project_id: string | null;
  department: string | null;
  channel_key: ProjectChannelKey | null;
  name: string | null;
  created_by: string | null;
  is_archived: boolean;
  last_message_at: string | null;
  created_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  member_role: "owner" | "member";
  muted: boolean;
  last_read_at: string | null;
  joined_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  parent_message_id: string | null;
  author_id: string | null;
  body: string;
  message_type: "text" | "system";
  quoted_message_id: string | null;
  is_pinned: boolean;
  pinned_by: string | null;
  pinned_at: string | null;
  priority: MessagePriority | null;
  expires_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  conversation_id: string;
  project_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MessageMention {
  id: string;
  message_id: string;
  conversation_id: string;
  mention_type: MentionType;
  mentioned_user_id: string | null;
  created_at: string;
}

export interface AnnouncementAck {
  message_id: string;
  user_id: string;
  acked_at: string;
}

// ===== Work Management & Task Orchestration (migration 0061) =====

export type ProjectRole =
  | "pm" | "ba" | "designer" | "developer" | "qa" | "support" | "executor"
  // Phase 4 — أدوار أوسع
  | "frontend" | "backend" | "fullstack" | "ai_engineer" | "prompt_engineer" | "devops" | "supervisor";
export type MilestoneDeliveryType = "prototype" | "module" | "beta" | "alpha" | "release_candidate" | "final" | "custom";
export type MilestoneApprovalStatus =
  | "pending" | "internal_review" | "manager_approved" | "client_approved"
  | "approved" | "rejected" | "changes_requested" | "needs_revision";
export type OwnershipType = "project" | "technical" | "business" | "delivery" | "support";
export type ItemVisibility = "internal" | "client_visible" | "hidden";
export type TaskPriority = "critical" | "high" | "medium" | "low" | "optional";
export type TaskStatus =
  | "backlog" | "planned" | "ready" | "in_progress" | "waiting"
  | "review" | "testing" | "blocked" | "completed" | "cancelled" | "archived";
export type TaskSourceType =
  | "manual" | "chat" | "eqa_finding" | "recommendation" | "brain_comment"
  | "meeting" | "incident" | "prototype_gap" | "requirement" | "risk"
  | "knowledge_gap" | "knowledge_insight";

export interface ProjectMember {
  project_id: string;
  user_id: string;
  project_role: ProjectRole;
  added_by: string | null;
  added_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  delivery_type: MilestoneDeliveryType;
  planned_date: string | null;
  actual_date: string | null;
  approval_status: MilestoneApprovalStatus;
  progress_pct: number;
  internal_notes: string | null;
  client_feedback: string | null;
  order_index: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Phase 4 — Delivery Phase fields
  objectives: string | null;
  deliverables: string[];
  expected_output: string | null;
  start_date: string | null;
  estimated_days: number | null;
  assigned_user_ids: string[];
  visibility: ItemVisibility;
}

export interface ProjectOwnership {
  project_id: string;
  ownership_type: OwnershipType;
  user_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
}

export interface DeliveryApproval {
  id: string;
  milestone_id: string;
  project_id: string;
  status: MilestoneApprovalStatus;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

// ===== Workflow Automation Engine (migration 0063) =====

export interface PlatformEvent {
  id: string;
  event_type: string;
  project_id: string | null;
  actor_id: string | null;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  event_id: string | null;
  event_type: string;
  project_id: string | null;
  status: "completed" | "failed" | "skipped";
  actions_run: { action: string; ok: boolean; detail?: string }[];
  error: string | null;
  attempts: number;
  created_at: string;
}

// ===== Knowledge & Decision Intelligence (migration 0064) =====

export type BusinessModuleStatus = "candidate" | "validated" | "approved" | "deprecated";

export interface BusinessModule {
  id: string;
  module_key: string;
  name: string;
  primary_domain: string | null;
  features: string[];
  business_rules: string[];
  required_permissions: string[];
  required_reports: string[];
  recommended_architecture: string | null;
  common_mistakes: string[];
  qa_findings: string[];
  source_project_ids: string[];
  occurrence_count: number;
  status: BusinessModuleStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectModuleDetection {
  id: string;
  project_id: string;
  module_key: string;
  present: boolean;
  detected_features: string[];
  missing_features: string[];
  created_at: string;
  updated_at: string;
}

export interface ArchitectureGaps {
  reports: string[];
  permissions: string[];
  roles: string[];
  integrations: string[];
  workflows: string[];
  dashboards: string[];
  notifications: string[];
  business_rules: string[];
  audit_logs: string[];
  security: string[];
  apis: string[];
  db_tables: string[];
}

export interface ArchitectureValidationReport {
  id: string;
  project_id: string;
  status: "generating" | "ready" | "failed";
  domain: string | null;
  missing_modules: { module_key: string; name: string; reason: string }[];
  missing_features: { module_key: string; feature: string }[];
  gaps: Partial<ArchitectureGaps>;
  reused_insights: { project_id: string; name: string; modules: string[]; mistakes: string[]; qa: string[] }[];
  readiness_score: number;
  ai_summary: string | null;
  last_error: string | null;
  generated_from_brain_version: number | null;
  requested_by: string | null;
  generated_at: string;
}

// ===== Executive AI Command Center (migration 0065) =====

export interface CompanyMetricSnapshot {
  id: string;
  snapshot_at: string;
  health_score: number;
  health_band: "green" | "yellow" | "red";
  kpis: Record<string, number>;
  breakdown: { key: string; label: string; score: number; weight: number }[];
  signals: Record<string, number>;
}

export type ExecutiveReportPeriod =
  | "weekly" | "monthly" | "quarterly" | "annual"
  | "portfolio" | "engineering" | "support" | "delivery" | "risk";

export interface ExecutiveReportAnalysis {
  risks: string[];
  recommendations: string[];
  predictions: string[];
  action_plan: string[];
}

export interface ExecutiveReport {
  id: string;
  period_type: ExecutiveReportPeriod;
  title: string;
  status: "generating" | "ready" | "failed";
  executive_summary: string | null;
  kpis: Record<string, number>;
  analysis: Partial<ExecutiveReportAnalysis>;
  health_score: number | null;
  last_error: string | null;
  generated_by: string | null;
  generated_at: string;
}

export interface ExecutiveInsight {
  id: string;
  kind: "assistant" | "prediction";
  question: string | null;
  answer: string;
  evidence: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface TaskChecklistItem {
  text: string;
  done: boolean;
}

export interface TaskAiEstimate {
  complexity: "low" | "medium" | "high";
  effort_hours: number;
  risk: "low" | "medium" | "high";
  rationale: string;
}

export interface Task {
  id: string;
  project_id: string;
  milestone_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  buffer_hours: number | null;
  ai_estimate: TaskAiEstimate | null;
  checklist: TaskChecklistItem[];
  source_type: TaskSourceType | null;
  source_reference: string | null;
  order_index: number;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  assigned_by: string | null;
  assigned_at: string;
}

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  project_id: string;
  author_id: string | null;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string | null;
  project_id: string;
  actor_id: string | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  project_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  country: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  client_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  language: string | null;
  created_at: string;
}

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

export interface Lead {
  id: string;
  client_id: string | null;
  contact_id: string | null;
  source: string | null;
  status: LeadStatus;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  converted_to_project_id: string | null;
  archived_at: string | null;
  // نوع المشروع/قالب الاكتشاف المختار عند الإنشاء (migration 0020) — nullable
  discovery_template_id: string | null;
}

export type ProjectType = "website" | "mobile_app" | "saas" | "dashboard" | "other";
export type PaymentStatus = "unpaid" | "partial" | "paid";

/**
 * مراحل المشروع — قابلة للتوسع لاحقًا (Phase 2+) دون تعديل الـ schema،
 * لأن العمود stage هو نص حر في قاعدة البيانات. القائمة هنا هي القيم
 * المعتمدة في الواجهة حاليًا فقط.
 */
export type ProjectStage =
  | "lead"
  | "intake"
  | "research"
  | "discovery_meeting"
  | "scope_proposal"
  | "prototype"
  | "build"
  | "launch"
  | "support"
  | "reopened";

export interface Project {
  id: string;
  client_id: string | null;
  lead_id: string | null;
  name: string;
  project_type: ProjectType;
  stage: string; // نص حر في القاعدة، القيم المعروفة في ProjectStage
  owner_id: string | null;
  price: number | null;
  currency: string;
  payment_status: PaymentStatus;
  created_at: string;
  stage_changed_at: string;
  ai_analysis: ProjectAnalysis | null;
  project_code: string;
  widget_key: string | null;
  widget_key_created_at: string | null;
  widget_key_last_used_at: string | null;
  archived_at: string | null;
  // قالب الاكتشاف المرتبط بالمشروع (migration 0020) — nullable
  discovery_template_id: string | null;
}

export interface ProjectAnalysis {
  root_problem: string;
  target_users: string[];
  opportunities: string[];
  risks: string[];
  meeting_questions: string[];
}

export type DiscoveryFormStatus = "draft" | "sent" | "submitted";

/**
 * لقطة سؤال واحد تُحفظ مع الفورم وقت التسليم، عشان عرض الإجابات
 * وتلخيص الـ AI يفضلوا صحيحين حتى لو القالب اتعدّل أو اتحذف بعدين.
 */
export interface DiscoverySnapshotItem {
  key: string; // = discovery_questions.id
  label: string;
  type: DiscoveryQuestionType;
  category: string | null;
  order: number;
}

export interface DiscoveryForm {
  id: string;
  project_id: string;
  answers: Record<string, unknown>;
  status: DiscoveryFormStatus;
  sent_at: string | null;
  submitted_at: string | null;
  created_at: string;
  // أعمدة Smart Discovery Engine (migration 0020) — nullable للفورمات القديمة
  template_id: string | null;
  questions_snapshot: DiscoverySnapshotItem[] | null;
  updated_at: string;
  // Discovery Workspace (migration 0057) — الاستجابات مربوطة بجلسة (رابط)
  link_id: string | null;
}

// ============================================================
// Smart Discovery Engine (migration 0020)
// ============================================================

export type DiscoveryTemplateStatus = "active" | "inactive";

export type DiscoveryQuestionType =
  | "short_text"
  | "long_text"
  | "yes_no"
  | "multiple_choice"
  | "checkbox"
  | "rating"
  | "number"
  | "website"
  | "email"
  | "phone"
  | "date"
  | "file_upload"
  | "logo_upload"
  | "document_upload"
  // أنواع جديدة (migration 0055 — AI Discovery Form Generator)
  | "currency"
  | "time"
  | "multi_select";

export interface DiscoveryQuestionValidation {
  maxLength?: number;
  allowedFileTypes?: string[]; // امتدادات بدون نقطة: ["pdf","png"]
  maxFileSizeMb?: number;
}

/** عامل المقارنة في منطق الإظهار الشرطي لسؤال. */
export type DiscoveryConditionalOperator =
  | "equals"
  | "not_equals"
  | "includes"
  | "exists"
  | "not_exists";

/**
 * منطق إظهار شرطي لسؤال — يُظهره فقط لو تحقّق الشرط على إجابة سؤال
 * سابق (dependsOn = discovery_questions.id). null = يظهر دائمًا.
 */
export interface DiscoveryQuestionConditional {
  dependsOn: string;
  operator: DiscoveryConditionalOperator;
  value?: unknown;
}

/** مصدر القالب: يدوي أو مُولَّد بالذكاء الاصطناعي (migration 0055). */
export type DiscoveryTemplateSource = "manual" | "ai_generated";

export interface DiscoveryFormTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  icon: string | null;
  is_default: boolean;
  status: DiscoveryTemplateStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // ميتاداتا المولّد (migration 0055) — nullable/بقيَم افتراضية للقوالب القديمة
  source: DiscoveryTemplateSource;
  industry_domain: ProjectDomain | null;
  company_size: string | null;
  complexity: string | null;
  discovery_depth: string | null;
  ai_version: string | null;
  prompt_version: string | null;
  tags: string[];
  estimated_project_size: string | null;
  estimated_question_count: number | null;
  created_by: string | null;
  usage_count: number;
  last_used_at: string | null;
  is_favorite: boolean;
  generation_input: DiscoveryGenerationInput | null;
  version: number;
}

export interface DiscoveryQuestion {
  id: string;
  template_id: string;
  question: string;
  description: string | null;
  type: DiscoveryQuestionType;
  required: boolean;
  placeholder: string | null;
  options: string[];
  help_text: string | null;
  sort_order: number;
  ai_weight: number;
  category: string | null;
  validation: DiscoveryQuestionValidation;
  // منطق الإظهار الشرطي (migration 0055) — null = يظهر دائمًا
  conditional: DiscoveryQuestionConditional | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// AI Discovery Form Generator (migration 0055)
// ============================================================

export type DiscoveryCompanySize = "startup" | "sme" | "enterprise" | "government";
export type DiscoveryComplexity = "simple" | "medium" | "large" | "enterprise";
export type DiscoveryDepth = "quick" | "standard" | "deep" | "enterprise_audit";

/** مُدخلات المستخدم لتوليد فورم اكتشاف مخصص. */
export interface DiscoveryGenerationInput {
  businessDescription: string;
  clientGoals: string | null;
  knownFeatures: string | null;
  industryDomain: ProjectDomain;
  companySize: DiscoveryCompanySize;
  complexity: DiscoveryComplexity;
  depth: DiscoveryDepth;
  templateName: string | null;
  /** تعليمات تحسين/تعديل لإعادة توليد نموذج أفضل (اختياري). */
  refinement?: string | null;
  /** أسئلة النموذج السابق (سياق لإعادة التوليد مع الإضافات). */
  previousQuestions?: string[] | null;
}

export type DiscoveryGenerationJobStatus = "pending" | "running" | "completed" | "failed";

export interface DiscoveryGenerationJob {
  id: string;
  template_id: string | null;
  status: DiscoveryGenerationJobStatus;
  provider: string | null;
  model: string | null;
  input: DiscoveryGenerationInput | Record<string, never>;
  output: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface DiscoveryGenerationFeedback {
  id: string;
  template_id: string;
  discovery_form_id: string | null;
  project_id: string | null;
  question_id: string;
  question_label: string;
  question_category: string | null;
  question_type: string | null;
  industry_domain: string | null;
  was_answered: boolean;
  created_at: string;
}

/** ملف مرفوع محفوظ داخل إجابة سؤال من نوع رفع ملف. */
export interface DiscoveryUploadedFile {
  path: string; // مسار Supabase Storage داخل bucket = discovery-uploads
  name: string;
  size: number;
  type: string;
}

// ============================================================
// Public Discovery Portal (migration 0021)
// ============================================================

export type DiscoveryLinkStatus =
  | "pending"
  | "opened"
  | "in_progress"
  | "submitted"
  | "expired"
  | "cancelled";

export interface DiscoveryFormLink {
  id: string;
  project_id: string;
  lead_id: string | null;
  template_id: string | null;
  token: string;
  status: DiscoveryLinkStatus;
  expires_at: string | null; // null = بلا انتهاء
  opened_at: string | null;
  submitted_at: string | null;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Link analytics (migration 0022) — nullable للروابط القديمة
  first_open_at: string | null;
  visit_count: number;
  last_country: string | null;
  last_device: string | null;
  last_browser: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  // Discovery Workspace (migration 0057) — كل رابط = جلسة اكتشاف مستقلة
  session_name: string | null;
  department: string | null;
  tags: string[];
}

// ============================================================
// WhatsApp Communication Engine (migration 0022)
// ============================================================

export type WhatsAppProviderName =
  | "noop"
  | "meta_cloud"
  | "twilio"
  | "ultramsg"
  | "green_api"
  | "360dialog";

export type WhatsAppMessagePurpose =
  | "discovery_invitation"
  | "reminder_before_open"
  | "reminder_before_completion"
  | "thank_you"
  | "manual";

export type WhatsAppMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";

export type WhatsAppMessageDirection = "outbound" | "inbound";

export interface WhatsAppSettings {
  scope: "global";
  provider: WhatsAppProviderName;
  default_country: string;
  default_link_expiration_days: number | null;
  reminders_enabled: boolean;
  reminder_max_count: number;
  reminder_interval_hours: number;
  updated_at: string;
  updated_by: string | null;
}

export interface WhatsAppProviderStatus {
  provider: WhatsAppProviderName;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_message: string | null;
}

export interface WhatsAppTemplate {
  id: string;
  key: string;
  name: string;
  purpose: WhatsAppMessagePurpose;
  body: string;
  language: string;
  variables: string[];
  is_default: boolean;
  status: "active" | "inactive";
  updated_at: string;
  updated_by: string | null;
}

export interface WhatsAppMessage {
  id: string;
  project_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  link_id: string | null;
  direction: WhatsAppMessageDirection;
  phone: string;
  purpose: WhatsAppMessagePurpose;
  template_key: string | null;
  body: string;
  reminder_index: number;
  provider: WhatsAppProviderName;
  provider_message_id: string | null;
  status: WhatsAppMessageStatus;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  retry_count: number;
  acknowledged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BrainEntryType =
  | "note"
  | "decision"
  | "link"
  | "risk"
  | "question"
  | "request"
  | "deadline";

export interface ProjectBrainEntry {
  id: string;
  project_id: string;
  entry_type: BrainEntryType;
  content: string;
  created_by: string | null;
  created_at: string;
  source_meeting_id: string | null;
}

export type MeetingStatus =
  | "pending"
  | "transcribing"
  | "transcribed"
  | "extracting"
  | "processed"
  | "failed";

export interface Meeting {
  id: string;
  project_id: string;
  project_code: string;
  title: string | null;
  meeting_date: string;
  recording_url: string | null;
  status: MeetingStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // سبب الفشل (migration 0026) — للعرض في الواجهة
  error_code: string | null;
  error_message: string | null;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  raw_text: string;
  created_at: string;
}

export interface MeetingExtraction {
  decisions: string[];
  risks: string[];
  requests: string[];
  questions: string[];
  deadlines: string[];
}

export interface DecisionLogItem {
  content: string;
  source: string;
}

export interface OpenQuestionItem {
  question: string;
  answered: boolean;
}

export type ProjectBrainSyncStatus = "idle" | "syncing" | "failed";

export interface ProjectBrain {
  project_id: string;
  summary: string;
  summary_is_manual: boolean;
  pending_summary: string | null;
  key_facts: string[];
  pain_points: string[];
  decisions_log: DecisionLogItem[];
  open_questions: OpenQuestionItem[];
  version: number;
  sync_status: ProjectBrainSyncStatus;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectBrainVersionReason =
  | "meeting_processed"
  | "discovery_form_updated"
  | "manual_resync"
  | "manual_edit"
  | "accepted_proposal";

export interface ProjectBrainVersion {
  id: string;
  project_id: string;
  version: number;
  summary: string | null;
  key_facts: string[] | null;
  pain_points: string[] | null;
  decisions_log: DecisionLogItem[] | null;
  open_questions: OpenQuestionItem[] | null;
  reason: ProjectBrainVersionReason;
  is_manual: boolean;
  created_by: string | null;
  created_at: string;
}

export interface UserStory {
  role: string;
  want: string;
  benefit: string;
}

export interface AcceptanceCriterion {
  given: string;
  when: string;
  then: string;
}

export type PRDSyncStatus = "idle" | "generating" | "failed";

export type PRDVersionReason =
  | "full_generation"
  | "partial_regeneration"
  | "manual_edit"
  | "conflict_replace"
  | "auto_resync";

export const PRD_SECTION_KEYS = [
  "overview",
  "problem_statement",
  "goals",
  "out_of_scope",
  "target_users",
  "user_stories",
  "acceptance_criteria",
  "functional_requirements",
  "non_functional_requirements",
  "risks_assumptions",
  "success_metrics",
] as const;

export type PRDSectionKey = (typeof PRD_SECTION_KEYS)[number];

export interface PRD {
  id: string;
  project_id: string;
  overview: string;
  problem_statement: string;
  goals: string[];
  out_of_scope: string[];
  target_users: string[];
  user_stories: UserStory[];
  acceptance_criteria: AcceptanceCriterion[];
  functional_requirements: string[];
  non_functional_requirements: string[];
  risks_assumptions: string[];
  success_metrics: string[];
  version: number;
  status: string;
  generated_from_brain_version: number | null;
  sync_status: PRDSyncStatus;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PRDVersion {
  id: string;
  prd_id: string;
  project_id: string;
  version: number;
  overview: string | null;
  problem_statement: string | null;
  goals: string[] | null;
  out_of_scope: string[] | null;
  target_users: string[] | null;
  user_stories: UserStory[] | null;
  acceptance_criteria: AcceptanceCriterion[] | null;
  functional_requirements: string[] | null;
  non_functional_requirements: string[] | null;
  risks_assumptions: string[] | null;
  success_metrics: string[] | null;
  status: string | null;
  generated_from_brain_version: number | null;
  reason: PRDVersionReason;
  section_regenerated: PRDSectionKey | null;
  created_by: string | null;
  created_at: string;
}

export const PROTOTYPE_PROMPT_SECTION_KEYS = [
  "context",
  "project_goal",
  "technical_context",
  "required_features",
  "functional_requirements",
  "user_stories",
  "acceptance_criteria",
  "edge_cases",
  "constraints",
  "out_of_scope",
  "architecture_notes",
  "ui_guidelines",
  "code_quality_requirements",
  "testing_expectations",
  "definition_of_done",
] as const;

export type PrototypePromptSectionKey = (typeof PROTOTYPE_PROMPT_SECTION_KEYS)[number];

export const PROTOTYPE_PROMPT_TARGET_TOOLS = ["claude_code", "v0", "lovable", "general"] as const;
export type PrototypePromptTargetTool = (typeof PROTOTYPE_PROMPT_TARGET_TOOLS)[number];

export type PrototypePromptSyncStatus = "idle" | "generating" | "failed";
export type PrototypePromptVersionReason = PRDVersionReason;

export type PrototypePromptSections = Record<PrototypePromptSectionKey, string>;

export interface PrototypePrompt extends PrototypePromptSections {
  id: string;
  project_id: string;
  target_tool: string;
  version: number;
  status: string;
  generated_from_prd_version: number | null;
  generated_from_brain_version: number | null;
  sync_status: PrototypePromptSyncStatus;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrototypePromptVersion extends Partial<PrototypePromptSections> {
  id: string;
  prompt_id: string;
  project_id: string;
  version: number;
  target_tool: string | null;
  status: string | null;
  generated_from_prd_version: number | null;
  generated_from_brain_version: number | null;
  reason: PrototypePromptVersionReason;
  section_regenerated: PrototypePromptSectionKey | null;
  created_by: string | null;
  created_at: string;
}

// ============================================================
// Prototype Prompt Pipeline (V2) — نظام جديد بجانب النظام أعلاه
// (لا يستبدله): بيقسّم المشروع لـ N Prompt متسلسل بدل Prompt واحد ضخم.
// ============================================================

export type PrototypePromptPlanSize = "small" | "medium" | "enterprise";
export type PrototypePromptPlanStatus = "idle" | "generating" | "ready" | "failed";
export type PrototypePromptStageStatus = "pending" | "generating" | "ready" | "failed";

export interface PrototypePromptPlanModule {
  index: number;
  title: string;
  summary: string;
  depends_on: number[];
}

export interface PrototypePromptPlan {
  id: string;
  project_id: string;
  version: number;
  target_tool: string;
  project_size: PrototypePromptPlanSize | null;
  execution_summary: string;
  modules: PrototypePromptPlanModule[];
  stage_count: number;
  status: PrototypePromptPlanStatus;
  last_error: string | null;
  generated_from_prd_version: number | null;
  generated_from_brain_version: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrototypePromptStage {
  id: string;
  plan_id: string;
  project_id: string;
  stage_index: number;
  title: string;
  summary: string;
  depends_on: number[];
  content: string | null;
  status: PrototypePromptStageStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ImplementationStatus =
  | "implemented"
  | "partially_implemented"
  | "implemented_differently"
  | "not_implemented";

export interface EvidenceRef {
  file: string;
  function_or_component?: string;
  line?: number;
}

export interface PMOverride {
  status: ImplementationStatus;
  note?: string;
  overridden_by: string | null;
  overridden_at: string;
}

export interface UserStoryReview {
  story: string;
  ai_status: ImplementationStatus;
  ai_evidence: EvidenceRef[] | null;
  ai_gap: string | null;
  pm_override: PMOverride | null;
}

export interface AcceptanceCriterionReview {
  criterion: string;
  ai_status: ImplementationStatus;
  ai_evidence: EvidenceRef[] | null;
  ai_gap: string | null;
  pm_override: PMOverride | null;
}

export interface GapReport {
  user_stories: UserStoryReview[];
  acceptance_criteria_results: AcceptanceCriterionReview[];
  missing_features: string[];
  scope_creep: string[];
  non_functional_gaps: string[];
  unresolved_risks: string[];
  recommendation_summary: string;
}

export type PrototypeReviewOverallStatus = "ready" | "needs_changes" | "blocked";
export type PrototypeReviewSyncStatus = "idle" | "reviewing" | "failed";
export type PrototypeReviewVersionReason = "review_run" | "manual_override";

export interface PrototypeReview {
  id: string;
  project_id: string;
  repo_url: string;
  repo_ref: string;
  reviewed_prd_version: number | null;
  reviewed_prompt_version: number | null;
  gap_report: GapReport;
  completion_percentage: number;
  overall_status: PrototypeReviewOverallStatus;
  version: number;
  sync_status: PrototypeReviewSyncStatus;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrototypeReviewVersion {
  id: string;
  review_id: string;
  project_id: string;
  version: number;
  repo_url: string | null;
  repo_ref: string | null;
  reviewed_prd_version: number | null;
  reviewed_prompt_version: number | null;
  gap_report: GapReport | null;
  completion_percentage: number | null;
  overall_status: PrototypeReviewOverallStatus | null;
  reason: PrototypeReviewVersionReason;
  created_by: string | null;
  created_at: string;
}

export const CLIENT_PRESENTATION_SLIDE_KEYS = [
  "cover",
  "agenda",
  "executive_summary",
  "about_company",
  "business_problem",
  "current_situation",
  "pain_points",
  "our_understanding",
  "vision",
  "solution",
  "scope",
  "features",
  "modules",
  "workflow",
  "before_after",
  "departments",
  "user_roles",
  "reports",
  "ai_capabilities",
  "timeline",
  "architecture",
  "risks",
  "roi",
  "kpis",
  "roadmap",
  "transformation",
  "next_steps",
  "qa",
  "closing",
] as const;

export type ClientPresentationSlideKey = (typeof CLIENT_PRESENTATION_SLIDE_KEYS)[number];

export interface SlideCover {
  title: string;
  subtitle: string;
  client_name: string;
}
export interface SlideAgenda {
  items: string[];
}
export interface SlideExecutiveSummary {
  title: string;
  body: string;
  highlights: string[];
}
export interface SlideBusinessProblem {
  title: string;
  body: string;
}
export interface SlideCurrentSituation {
  title: string;
  body: string;
  points: string[];
}
export interface SlidePainPoints {
  title: string;
  items: string[];
}
export interface SlideSolution {
  title: string;
  body: string;
}
export interface SlideScope {
  in_scope: string[];
  out_of_scope: string[];
}
export interface SlideFeatures {
  title: string;
  features: string[];
}
export interface TimelinePhase {
  name: string;
  duration: string;
  description: string;
}
export interface SlideTimeline {
  title: string;
  phases: TimelinePhase[];
}
export interface SlideArchitecture {
  title: string;
  description: string;
  components: string[];
}
export interface RiskItem {
  risk: string;
  mitigation: string;
}
export interface SlideRisks {
  title: string;
  items: RiskItem[];
}
export interface RoadmapMilestone {
  name: string;
  target_date: string;
  description: string;
}
export interface SlideRoadmap {
  title: string;
  milestones: RoadmapMilestone[];
}
export interface KpiMetric {
  name: string;
  value: string;
  description: string;
}
export interface SlideKpis {
  title: string;
  metrics: KpiMetric[];
}
export interface SlideNextSteps {
  title: string;
  items: string[];
}
export interface SlideQa {
  title: string;
  items: string[];
}
export interface SlideClosing {
  title: string;
  body: string;
}

// ---- الشرائح التنفيذية الإضافية (توسعة العرض التنفيذي — أعمال فقط) ----
export interface SlideAboutCompany {
  title: string;
  body: string;
}
export interface SlideOurUnderstanding {
  title: string;
  body: string;
  points: string[];
}
export interface SlideVision {
  title: string;
  body: string;
}
export interface SlideModules {
  title: string;
  items: string[];
}
export interface SlideWorkflow {
  title: string;
  items: string[];
}
export interface BeforeAfterPair {
  before: string;
  after: string;
}
export interface SlideBeforeAfter {
  title: string;
  pairs: BeforeAfterPair[];
}
export interface SlideDepartments {
  title: string;
  items: string[];
}
export interface SlideUserRoles {
  title: string;
  items: string[];
}
export interface SlideReports {
  title: string;
  items: string[];
}
export interface SlideAiCapabilities {
  title: string;
  items: string[];
}
export interface SlideRoi {
  title: string;
  metrics: KpiMetric[];
}
export interface SlideTransformation {
  title: string;
  body: string;
  points: string[];
}

export interface ClientPresentationSlides {
  cover: SlideCover;
  agenda: SlideAgenda;
  executive_summary: SlideExecutiveSummary;
  about_company: SlideAboutCompany;
  business_problem: SlideBusinessProblem;
  current_situation: SlideCurrentSituation;
  pain_points: SlidePainPoints;
  our_understanding: SlideOurUnderstanding;
  vision: SlideVision;
  solution: SlideSolution;
  scope: SlideScope;
  features: SlideFeatures;
  modules: SlideModules;
  workflow: SlideWorkflow;
  before_after: SlideBeforeAfter;
  departments: SlideDepartments;
  user_roles: SlideUserRoles;
  reports: SlideReports;
  ai_capabilities: SlideAiCapabilities;
  timeline: SlideTimeline;
  architecture: SlideArchitecture;
  risks: SlideRisks;
  roi: SlideRoi;
  kpis: SlideKpis;
  roadmap: SlideRoadmap;
  transformation: SlideTransformation;
  next_steps: SlideNextSteps;
  qa: SlideQa;
  closing: SlideClosing;
}

export type ClientPresentationStatus = "idle" | "generating" | "failed";
export type PresentationLanguage = "ar" | "en";
export type ClientPresentationVersionReason =
  | "full_generation"
  | "partial_regeneration"
  | "manual_edit"
  | "auto_resync";

export interface ClientPresentation {
  id: string;
  project_id: string;
  slides_content: ClientPresentationSlides;
  generated_from_brain_version: number | null;
  generated_from_prd_version: number | null;
  generated_from_review_version: number | null;
  pptx_storage_path: string | null;
  share_token: string | null;
  share_token_created_at: string | null;
  share_token_last_used_at: string | null;
  version: number;
  status: ClientPresentationStatus;
  language: PresentationLanguage;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPresentationVersion {
  id: string;
  presentation_id: string;
  project_id: string;
  version: number;
  slides_content: ClientPresentationSlides | null;
  generated_from_brain_version: number | null;
  generated_from_prd_version: number | null;
  generated_from_review_version: number | null;
  reason: ClientPresentationVersionReason;
  slide_regenerated: ClientPresentationSlideKey | null;
  created_by: string | null;
  created_at: string;
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "stage_change"
  | "login"
  | "logout"
  | "failed_login";

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export const DEVELOPER_HANDOFF_SECTION_KEYS = [
  "project_overview",
  "repository_environment",
  "expected_behavior",
  "known_state",
  "review_focus_areas",
  "bug_reporting_format",
  "review_acceptance_criteria",
] as const;

export type DeveloperHandoffSectionKey = (typeof DEVELOPER_HANDOFF_SECTION_KEYS)[number];

export interface DeveloperHandoffProjectOverview {
  summary: string;
}

export interface DeveloperHandoffRepositoryEnvironment {
  repo_url: string;
  repo_ref: string;
  setup_steps: string[];
}

export interface DeveloperHandoffExpectedBehaviorItem {
  source: "user_story" | "acceptance_criterion";
  statement: string;
}

export interface DeveloperHandoffExpectedBehavior {
  items: DeveloperHandoffExpectedBehaviorItem[];
}

export type DeveloperHandoffReviewFocusPriority = "high" | "medium" | "low";

export interface DeveloperHandoffReviewFocusItem {
  area: string;
  priority: DeveloperHandoffReviewFocusPriority;
  reason: string;
}

export interface DeveloperHandoffReviewFocusAreas {
  items: DeveloperHandoffReviewFocusItem[];
}

export interface DeveloperHandoffBugReportingFormat {
  template: string;
}

export interface DeveloperHandoffReviewAcceptanceCriteria {
  items: string[];
}

export interface DeveloperHandoffPackageContent {
  project_overview: DeveloperHandoffProjectOverview;
  repository_environment: DeveloperHandoffRepositoryEnvironment;
  expected_behavior: DeveloperHandoffExpectedBehavior;
  known_state: GapReport;
  review_focus_areas: DeveloperHandoffReviewFocusAreas;
  bug_reporting_format: DeveloperHandoffBugReportingFormat;
  review_acceptance_criteria: DeveloperHandoffReviewAcceptanceCriteria;
}

export type DeveloperHandoffStatus = "draft" | "in_review" | "completed";
export type DeveloperHandoffSyncStatus = "idle" | "generating" | "failed";
export type DeveloperHandoffVersionReason =
  | "full_generation"
  | "manual_edit"
  | "status_change"
  | "auto_resync";

export interface DeveloperHandoff {
  id: string;
  project_id: string;
  package_content: DeveloperHandoffPackageContent;
  repo_url: string;
  repo_ref: string;
  generated_from_prd_version: number | null;
  generated_from_review_version: number | null;
  generated_from_brain_version: number | null;
  access_credentials_ref: string | null;
  handoff_status: DeveloperHandoffStatus;
  version: number;
  sync_status: DeveloperHandoffSyncStatus;
  share_token: string | null;
  share_token_created_at: string | null;
  share_token_last_used_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperHandoffVersion {
  id: string;
  handoff_id: string;
  project_id: string;
  version: number;
  package_content: DeveloperHandoffPackageContent | null;
  repo_url: string | null;
  repo_ref: string | null;
  generated_from_prd_version: number | null;
  generated_from_review_version: number | null;
  generated_from_brain_version: number | null;
  handoff_status: DeveloperHandoffStatus | null;
  reason: DeveloperHandoffVersionReason;
  section_regenerated: DeveloperHandoffSectionKey | null;
  created_by: string | null;
  created_at: string;
}

export type SupportRequestType =
  | "usage_question"
  | "usage_problem"
  | "bug"
  | "feature_request"
  | "change_request"
  | "unclear";

export type SupportResolutionStatus = "open" | "auto_resolved" | "escalated" | "in_progress" | "resolved";

export type ConversationRole = "customer" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  created_at: string;
  /** مسار صورة مرفقة (Supabase Storage path) — للعرض عبر Signed URL بس. */
  attachmentPath?: string | null;
}

export type SupportPriority = "low" | "medium" | "high" | "critical";

export interface SupportStructuredSummary {
  problem_description: string;
  started_when: string | null;
  reproduction_steps: string | null;
  current_result: string | null;
  expected_result: string | null;
  priority: SupportPriority;
  attachments: string[];
}

export interface SupportRequest {
  id: string;
  project_id: string;
  conversation_transcript: ConversationMessage[];
  request_type: SupportRequestType;
  structured_summary: SupportStructuredSummary | Record<string, never>;
  resolution_status: SupportResolutionStatus;
  escalated_at: string | null;
  resolved_at: string | null;
  related_prd_section: string | null;
  related_brain_fact: string | null;
  customer_identifier: string | null;
  assigned_to: string | null;
  satisfaction_rating: 1 | -1 | null;
  satisfaction_rated_at: string | null;
  browser_info: Record<string, unknown>;
  environment_info: Record<string, unknown>;
  recent_client_errors: Array<{ message: string; source?: string; at: string }>;
  ai_diagnosis: SupportAiDiagnosis | Record<string, never>;
  created_at: string;
}

export interface SupportAiDiagnosis {
  probable_cause: string;
  suggested_fix: string;
  confidence: number;
}

export type SupportObservabilityEventType = "escalation" | "notification_delivery" | "widget_error";

export interface SupportObservabilityLogEntry {
  id: string;
  event_type: SupportObservabilityEventType;
  project_id: string | null;
  support_request_id: string | null;
  success: boolean;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AITaskModelConfig {
  task_type: string;
  provider: string;
  model: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AIProviderStatus {
  provider: string;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_message: string | null;
}

// ============================================================
// Engineering QA (Phase 12.1) — بنية تحتية لعمليات مراجعة هندسية
// متعددة المراحل عبر الزمن. منفصل كليًا عن Engineering Audit
// (تدقيق فوري بـ 6 محاور) — ده "Operating System" لجلسات مراجعة
// تاريخية متكررة، كل واحدة بمراحلها وشهادتها الخاصة.
// ============================================================

export type EngineeringReviewStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled"
  | "needs_review"
  | "certified"
  | "rejected";

export type EngineeringReviewStageStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type EngineeringCertificationStatus = "pending" | "issued" | "revoked";

export type EngineeringReviewEventType =
  | "review_created"
  | "review_started"
  | "stage_started"
  | "stage_finished"
  | "stage_failed"
  | "stage_retried"
  | "stage_cancelled"
  | "review_completed"
  | "review_cancelled"
  | "review_superseded"
  | "certificate_generated";

export interface EngineeringReview {
  id: string;
  project_id: string;
  review_number: number;
  review_version: number;
  repository_url: string;
  repository_branch: string;
  repository_commit: string | null;
  review_status: EngineeringReviewStatus;
  overall_progress: number;
  last_error: string | null;
  acknowledged_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** بوابة اعتماد "Engineering QA Review" (Workflow Engine Phase 1) — قرار بشري منفصل عن review_status الآلي. */
  pm_approval_status: "approved" | "rejected" | null;
  pm_approved_by: string | null;
  pm_approved_at: string | null;
  // Cancelable Reviews (migration 0056) — معرّف تنفيذ + حقول الإلغاء/الاستبدال
  execution_id: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  superseded_by_review_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EngineeringReviewStage {
  id: string;
  review_id: string;
  project_id: string;
  stage_key: string;
  stage_name: string;
  execution_order: number;
  stage_status: EngineeringReviewStageStatus;
  stage_version: number;
  retry_count: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface EngineeringStageResult {
  id: string;
  stage_id: string;
  review_id: string;
  project_id: string;
  score: number | null;
  summary: string;
  findings_json: unknown[];
  recommendations_json: unknown[];
  generated_at: string;
}

export interface EngineeringCertificate {
  id: string;
  review_id: string;
  project_id: string;
  certificate_number: string | null;
  certification_status: EngineeringCertificationStatus;
  overall_score: number | null;
  certificate_version: number;
  generated_at: string | null;
  created_at: string;
}

export interface EngineeringReviewEvent {
  id: string;
  review_id: string;
  project_id: string;
  event_type: EngineeringReviewEventType;
  stage_key: string | null;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

// ============================================================
// Static Architecture Review (Phase 12.2) — أول Stage حقيقي داخل
// Engineering QA (Phase 12.1): تحليل هيكلي/جودة كود ثابت (بدون تشغيل
// المشروع)، بمنطق تدريجي (Incremental) عبر git diff بين المراجعات.
// ============================================================

export const STATIC_REVIEW_CATEGORY_KEYS = [
  "architecture",
  "clean_code",
  "solid",
  "dry_kiss",
  "ai_code_smell",
  "naming",
  "documentation",
] as const;

export type StaticReviewCategoryKey = (typeof STATIC_REVIEW_CATEGORY_KEYS)[number];

export type StaticReviewStatus = "idle" | "generating" | "ready" | "failed";
export type StaticReviewCategoryStatus = "pending" | "generating" | "ready" | "failed";
export type StaticFindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type StaticReviewFileStatus = "unchanged" | "added" | "modified" | "removed";

export interface StaticReviewScoreSummary {
  architecture: number;
  maintainability: number;
  readability: number;
  solid: number;
  dry: number;
  naming: number;
  documentation: number;
  ai_code_quality: number;
  technical_debt: number;
  overall_static_score: number;
}

export interface StaticReview {
  id: string;
  project_id: string;
  engineering_review_id: string | null;
  engineering_stage_id: string | null;
  version: number;
  status: StaticReviewStatus;
  last_error: string | null;
  repo_url: string;
  repo_ref: string;
  base_sha: string | null;
  resolved_sha: string | null;
  is_incremental: boolean;
  total_files_in_repo: number;
  files_analyzed_count: number;
  files_reused_count: number;
  file_tree: string[];
  changed_files_snapshot: { path: string; content: string }[];
  score_summary: StaticReviewScoreSummary | null;
  category_count: number;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaticReviewCategory {
  id: string;
  static_review_id: string;
  project_id: string;
  category_key: StaticReviewCategoryKey;
  status: StaticReviewCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaticReviewFinding {
  id: string;
  static_review_id: string;
  project_id: string;
  category_key: StaticReviewCategoryKey;
  finding_key: string;
  severity: StaticFindingSeverity;
  title: string;
  description: string;
  impact: string;
  file_path: string;
  component_name: string | null;
  function_name: string | null;
  class_name: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string;
  root_cause: string;
  recommended_fix: string;
  patch_suggestion: string;
  validation_steps: string[];
  confidence_score: number;
  carried_over: boolean;
  created_at: string;
}

export interface StaticReviewFile {
  id: string;
  static_review_id: string;
  project_id: string;
  file_path: string;
  file_status: StaticReviewFileStatus;
  findings_count: number;
  created_at: string;
}

// ============================================================
// Security & Database Audit (Phase 12.3) — ثاني وثالث Stage حقيقي داخل
// Engineering QA، بعد Static Architecture Review (Phase 12.2). محركان
// مستقلان (Single Responsibility) بنفس شكل الجداول بالضبط.
// ============================================================

export type AuditFindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export const SECURITY_REVIEW_CATEGORY_KEYS = [
  "authentication",
  "authorization",
  "rls",
  "api_security",
  "input_validation",
  "secrets",
  "environment",
] as const;
export type SecurityReviewCategoryKey = (typeof SECURITY_REVIEW_CATEGORY_KEYS)[number];

export const DATABASE_REVIEW_CATEGORY_KEYS = [
  "database_structure",
  "query",
  "migration",
  "data_integrity",
  "storage",
  "logging",
] as const;
export type DatabaseReviewCategoryKey = (typeof DATABASE_REVIEW_CATEGORY_KEYS)[number];

export type PhaseAuditReviewStatus = "idle" | "generating" | "ready" | "failed";
export type PhaseAuditCategoryStatus = "pending" | "generating" | "ready" | "failed";
export type PhaseAuditFileStatus = "unchanged" | "added" | "modified" | "removed";

export interface SecurityScoreSummary {
  authentication: number;
  authorization: number;
  rls: number;
  api_security: number;
  secrets_management: number;
  configuration: number;
  overall_security_score: number;
}

export interface DatabaseScoreSummary {
  database_integrity: number;
  query_quality: number;
  storage_security: number;
  logging: number;
  overall_database_score: number;
}

interface PhaseAuditReviewBase {
  id: string;
  project_id: string;
  engineering_review_id: string | null;
  engineering_stage_id: string | null;
  version: number;
  status: PhaseAuditReviewStatus;
  last_error: string | null;
  repo_url: string;
  repo_ref: string;
  base_sha: string | null;
  resolved_sha: string | null;
  is_incremental: boolean;
  total_files_in_repo: number;
  files_analyzed_count: number;
  files_reused_count: number;
  file_tree: string[];
  changed_files_snapshot: { path: string; content: string }[];
  category_count: number;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityReview extends PhaseAuditReviewBase {
  score_summary: SecurityScoreSummary | null;
}

export interface DatabaseReview extends PhaseAuditReviewBase {
  score_summary: DatabaseScoreSummary | null;
}

export interface SecurityReviewCategory {
  id: string;
  security_review_id: string;
  project_id: string;
  category_key: SecurityReviewCategoryKey;
  status: PhaseAuditCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatabaseReviewCategory {
  id: string;
  database_review_id: string;
  project_id: string;
  category_key: DatabaseReviewCategoryKey;
  status: PhaseAuditCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface PhaseAuditFindingBase {
  id: string;
  project_id: string;
  finding_key: string;
  severity: AuditFindingSeverity;
  title: string;
  description: string;
  impact: string;
  file_path: string;
  component_name: string | null;
  function_name: string | null;
  class_name: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string;
  root_cause: string;
  attack_scenario: string;
  recommended_fix: string;
  patch_suggestion: string;
  validation_steps: string[];
  reference_links: string[];
  confidence_score: number;
  carried_over: boolean;
  created_at: string;
}

export interface SecurityReviewFinding extends PhaseAuditFindingBase {
  security_review_id: string;
  category_key: SecurityReviewCategoryKey;
}

export interface DatabaseReviewFinding extends PhaseAuditFindingBase {
  database_review_id: string;
  category_key: DatabaseReviewCategoryKey;
}

export interface SecurityReviewFile {
  id: string;
  security_review_id: string;
  project_id: string;
  file_path: string;
  file_status: PhaseAuditFileStatus;
  findings_count: number;
  created_at: string;
}

export interface DatabaseReviewFile {
  id: string;
  database_review_id: string;
  project_id: string;
  file_path: string;
  file_status: PhaseAuditFileStatus;
  findings_count: number;
  created_at: string;
}

// ============================================================
// Architecture / Code Quality / PRD Compliance / Performance Audit
// (EngQA-Merge) — أربع محركات إضافية بنفس شكل Security/Database
// بالضبط (نفس PhaseAuditReviewBase/PhaseAuditFindingBase المشتركة).
// بديل حقيقي (Diff + Findings بدليل) لمحاور كانت موجودة بس في نظام
// "Engineering Audit" القديم (تخمين AI شامل، بدون دليل من الكود).
// ============================================================

export const ARCHITECTURE_REVIEW_CATEGORY_KEYS = [
  "layering",
  "coupling",
  "scalability",
  "module_boundaries",
  "dependency_management",
  "api_design",
] as const;
export type ArchitectureReviewCategoryKey = (typeof ARCHITECTURE_REVIEW_CATEGORY_KEYS)[number];

export const CODE_QUALITY_REVIEW_CATEGORY_KEYS = [
  "readability",
  "duplication",
  "error_handling",
  "testing_coverage",
  "naming_consistency",
  "complexity",
] as const;
export type CodeQualityReviewCategoryKey = (typeof CODE_QUALITY_REVIEW_CATEGORY_KEYS)[number];

export const PRD_COMPLIANCE_REVIEW_CATEGORY_KEYS = [
  "functional_requirements_coverage",
  "non_functional_requirements",
  "scope_adherence",
  "acceptance_criteria",
] as const;
export type PrdComplianceReviewCategoryKey = (typeof PRD_COMPLIANCE_REVIEW_CATEGORY_KEYS)[number];

export const PERFORMANCE_REVIEW_CATEGORY_KEYS = [
  "query_performance",
  "bundle_size",
  "caching",
  "render_performance",
  "n_plus_one",
  "async_patterns",
] as const;
export type PerformanceReviewCategoryKey = (typeof PERFORMANCE_REVIEW_CATEGORY_KEYS)[number];

export interface ArchitectureScoreSummary {
  layering: number;
  coupling: number;
  scalability: number;
  module_boundaries: number;
  dependency_management: number;
  api_design: number;
  overall_architecture_score: number;
}

export interface CodeQualityScoreSummary {
  readability: number;
  duplication: number;
  error_handling: number;
  testing_coverage: number;
  naming_consistency: number;
  complexity: number;
  overall_code_quality_score: number;
}

export interface PrdComplianceScoreSummary {
  functional_requirements_coverage: number;
  non_functional_requirements: number;
  scope_adherence: number;
  acceptance_criteria: number;
  overall_prd_compliance_score: number;
}

export interface PerformanceScoreSummary {
  query_performance: number;
  bundle_size: number;
  caching: number;
  render_performance: number;
  n_plus_one: number;
  async_patterns: number;
  overall_performance_score: number;
}

export interface ArchitectureReview extends PhaseAuditReviewBase {
  score_summary: ArchitectureScoreSummary | null;
}
export interface CodeQualityReview extends PhaseAuditReviewBase {
  score_summary: CodeQualityScoreSummary | null;
}
export interface PrdComplianceReview extends PhaseAuditReviewBase {
  score_summary: PrdComplianceScoreSummary | null;
}
export interface PerformanceReview extends PhaseAuditReviewBase {
  score_summary: PerformanceScoreSummary | null;
}

export interface ArchitectureReviewCategory {
  id: string;
  architecture_review_id: string;
  project_id: string;
  category_key: ArchitectureReviewCategoryKey;
  status: PhaseAuditCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
export interface CodeQualityReviewCategory {
  id: string;
  code_quality_review_id: string;
  project_id: string;
  category_key: CodeQualityReviewCategoryKey;
  status: PhaseAuditCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
export interface PrdComplianceReviewCategory {
  id: string;
  prd_compliance_review_id: string;
  project_id: string;
  category_key: PrdComplianceReviewCategoryKey;
  status: PhaseAuditCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
export interface PerformanceReviewCategory {
  id: string;
  performance_review_id: string;
  project_id: string;
  category_key: PerformanceReviewCategoryKey;
  status: PhaseAuditCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchitectureReviewFinding extends PhaseAuditFindingBase {
  architecture_review_id: string;
  category_key: ArchitectureReviewCategoryKey;
}
export interface CodeQualityReviewFinding extends PhaseAuditFindingBase {
  code_quality_review_id: string;
  category_key: CodeQualityReviewCategoryKey;
}
export interface PrdComplianceReviewFinding extends PhaseAuditFindingBase {
  prd_compliance_review_id: string;
  category_key: PrdComplianceReviewCategoryKey;
}
export interface PerformanceReviewFinding extends PhaseAuditFindingBase {
  performance_review_id: string;
  category_key: PerformanceReviewCategoryKey;
}

export interface ArchitectureReviewFile {
  id: string;
  architecture_review_id: string;
  project_id: string;
  file_path: string;
  file_status: PhaseAuditFileStatus;
  findings_count: number;
  created_at: string;
}
export interface CodeQualityReviewFile {
  id: string;
  code_quality_review_id: string;
  project_id: string;
  file_path: string;
  file_status: PhaseAuditFileStatus;
  findings_count: number;
  created_at: string;
}
export interface PrdComplianceReviewFile {
  id: string;
  prd_compliance_review_id: string;
  project_id: string;
  file_path: string;
  file_status: PhaseAuditFileStatus;
  findings_count: number;
  created_at: string;
}
export interface PerformanceReviewFile {
  id: string;
  performance_review_id: string;
  project_id: string;
  file_path: string;
  file_status: PhaseAuditFileStatus;
  findings_count: number;
  created_at: string;
}

// ============================================================
// Production Validation Engine (Phase 4) — End-to-End QA حقيقي على
// نسخة شغّالة فعليًا من التطبيق (Staging/Preview URL)، مش قراءة كود.
// مفيش Incremental هنا — كل Session بتختبر الحالة الحيّة كاملة.
// ============================================================

export const VALIDATION_CATEGORY_KEYS = [
  "journey_execution",
  "responsive_validation",
  "accessibility_validation",
  "visual_regression",
] as const;
export type ValidationCategoryKey = (typeof VALIDATION_CATEGORY_KEYS)[number];

export type ValidationSessionStatus = "idle" | "generating" | "ready" | "failed";
export type ValidationCategoryStatus = "pending" | "generating" | "ready" | "failed";
export type ValidationJourneyStatus = "pending" | "running" | "passed" | "failed";
export type ValidationStepStatus = "passed" | "failed";

export interface ValidationScoreSummary {
  journey_success_rate: number;
  responsive_score: number;
  accessibility_score: number;
  visual_regression_score: number | null;
  overall_score: number;
}

export interface ValidationSession {
  id: string;
  project_id: string;
  engineering_review_id: string | null;
  engineering_stage_id: string | null;
  version: number;
  status: ValidationSessionStatus;
  last_error: string | null;
  staging_url: string;
  browser: string;
  viewport_matrix: string[];
  journeys_generated: number;
  journeys_passed: number;
  journeys_failed: number;
  journeys_flaky: number;
  category_count: number;
  score_summary: ValidationScoreSummary | null;
  production_ready: boolean | null;
  production_ready_reason: string;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationJourneyStep {
  type:
    | "navigate"
    | "click"
    | "fill"
    | "expect_text"
    | "wait"
    | "go_back"
    | "go_forward"
    | "reload"
    | "set_offline"
    | "set_online"
    | "throttle_network"
    | "double_click"
    | "rapid_click";
  target?: string;
  value?: string;
  inputKind?: "valid" | "empty" | "huge" | "special_chars" | "emoji" | "unicode" | "sql_injection_like";
  description: string;
}

export interface ValidationJourney {
  id: string;
  validation_session_id: string;
  project_id: string;
  journey_key: string;
  name: string;
  goal: string;
  steps: ValidationJourneyStep[];
  status: ValidationJourneyStatus;
  retry_count: number;
  is_flaky: boolean;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationStep {
  id: string;
  journey_id: string;
  validation_session_id: string;
  project_id: string;
  step_index: number;
  step_type: string;
  step_description: string;
  status: ValidationStepStatus;
  actual_result: string;
  screenshot_path: string | null;
  console_errors: string[];
  network_errors: string[];
  created_at: string;
}

export interface ValidationCategory {
  id: string;
  validation_session_id: string;
  project_id: string;
  category_key: ValidationCategoryKey;
  status: ValidationCategoryStatus;
  score: number | null;
  summary: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationFinding {
  id: string;
  validation_session_id: string;
  project_id: string;
  category_key: ValidationCategoryKey;
  finding_key: string;
  severity: AuditFindingSeverity;
  title: string;
  description: string;
  impact: string;
  root_cause: string;
  recommended_fix: string;
  steps_to_reproduce: string[];
  expected_result: string;
  actual_result: string;
  screenshot_path: string | null;
  console_logs: string[];
  network_logs: string[];
  stack_trace: string;
  browser: string;
  os: string;
  viewport: string;
  journey_name: string;
  occurrence_count: number;
  is_flaky: boolean;
  confidence_score: number;
  created_at: string;
}

// ============================================================
// Production Monitoring & Self-Healing Intelligence (Phase 5) — مراقبة
// مستمرة بعد النشر (يومية + يدوية)، منفصلة عن Engineering QA (مراجعات
// لحظة واحدة قبل التسليم). نفس محرك Playwright الحقيقي من Production
// Validation (Phase 4)، لكن فحوصات خفيفة Read-Only آمنة على Production.
// ============================================================

export type MonitoringCheckStatus = "pending" | "running" | "ready" | "failed";
export type MonitoringCheckTrigger = "cron" | "manual" | "deployment";
export type MonitoringOverallStatus = "healthy" | "degraded" | "down";
export type MonitoringIncidentCategory = "frontend" | "api" | "performance" | "availability" | "console_error" | "regression";
export type MonitoringIncidentStatus = "open" | "acknowledged" | "resolved";
export type MonitoringIncidentEventType = "detected" | "alerted" | "acknowledged" | "fix_proposed" | "resolved" | "reoccurred";

export interface MonitoringCheck {
  id: string;
  project_id: string;
  target_url: string;
  status: MonitoringCheckStatus;
  last_error: string | null;
  triggered_by: MonitoringCheckTrigger;
  overall_status: MonitoringOverallStatus | null;
  http_status: number | null;
  response_time_ms: number | null;
  page_load_time_ms: number | null;
  lcp_ms: number | null;
  cls: number | null;
  console_error_count: number;
  health_score: number | null;
  performance_score: number | null;
  is_regression: boolean;
  previous_check_id: string | null;
  checked_pages: string[];
  generated_at: string | null;
  /** بوابة اعتماد "Production Monitoring Review" (Workflow Engine Phase 1). */
  pm_approval_status: "approved" | "rejected" | null;
  pm_approved_by: string | null;
  pm_approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitoringIncident {
  id: string;
  project_id: string;
  first_check_id: string | null;
  last_check_id: string | null;
  incident_key: string;
  category: MonitoringIncidentCategory;
  severity: AuditFindingSeverity;
  status: MonitoringIncidentStatus;
  title: string;
  description: string;
  root_cause: string;
  confidence_score: number;
  evidence: Record<string, unknown>;
  affected_pages: string[];
  patch_proposal: string;
  refactoring_proposal: string;
  performance_proposal: string;
  security_proposal: string;
  ux_proposal: string;
  similar_incident_id: string | null;
  similarity_reason: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  affected_components: string[];
  risk_level: MonitoringPriorityLevel | null;
  workaround: string;
  permanent_solution: string;
  estimated_fix_time_hours: number | null;
  priority: MonitoringPriorityLevel | null;
  affected_users_estimate: string;
  source: "monitoring_check" | "support_ticket";
  support_request_id: string | null;
  created_at: string;
}

export type MonitoringPriorityLevel = "critical" | "high" | "medium" | "low";
export type MonitoringFixPromptArea = "database" | "frontend" | "api" | "worker" | "tests" | "deployment" | "other";
export type MonitoringFixPromptStatus = "pending" | "used" | "superseded";

export interface MonitoringFixPromptContent {
  title: string;
  context: string;
  problem: string;
  evidence: string;
  expected_result: string;
  acceptance_criteria: string[];
  files: string[];
  dependencies: string[];
  priority: MonitoringPriorityLevel;
  risks: string;
  testing_plan: string;
  rollback: string;
}

export interface MonitoringFixPrompt {
  id: string;
  incident_id: string;
  project_id: string;
  area: MonitoringFixPromptArea;
  order_index: number;
  content: MonitoringFixPromptContent;
  version: number;
  status: MonitoringFixPromptStatus;
  created_at: string;
}

export type MonitoringReviewVerdictType =
  | "solved_completely"
  | "solved_partially"
  | "still_exists"
  | "new_issues_introduced"
  | "performance_improved"
  | "security_improved"
  | "regression_found";

export interface MonitoringReviewVerdict {
  incident_id: string;
  verdict: MonitoringReviewVerdictType;
  evidence: string;
  explanation: string;
}

export interface MonitoringReviewReport {
  id: string;
  check_id: string | null;
  project_id: string;
  verdicts: MonitoringReviewVerdict[];
  overall_fix_score: number | null;
  requested_by: string | null;
  generated_at: string;
}

export type InfraServiceName = "railway" | "vercel" | "supabase";
export type InfraServiceStatusValue = "unknown" | "not_configured" | "healthy" | "degraded" | "down";

export interface InfraServiceStatus {
  id: string;
  project_id: string;
  service: InfraServiceName;
  configured: boolean;
  status: InfraServiceStatusValue;
  detail: Record<string, unknown>;
  checked_at: string;
}

export interface MonitoringIncidentEvent {
  id: string;
  incident_id: string;
  project_id: string;
  event_type: MonitoringIncidentEventType;
  detail: string;
  actor_id: string | null;
  created_at: string;
}

export interface AIRequestLogEntry {
  id: string;
  actor_id: string | null;
  project_id: string | null;
  provider: string;
  model_used: string;
  task_type: string;
  success: boolean;
  latency_ms: number | null;
  error_code: string | null;
  retry_count: number;
  created_at: string;
}

// ============================================================
// Organizational Intelligence & Continuous Learning (Phase 6)
// ============================================================

export type KnowledgeExtractionJobStatus = "idle" | "running" | "ready" | "failed";

export interface KnowledgeExtractionJob {
  id: string;
  project_id: string;
  status: KnowledgeExtractionJobStatus;
  last_error: string | null;
  extracted_count: number;
  linked_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductAdvisorAnalysisStatus = "idle" | "generating" | "ready" | "failed";

/** result بيتخزّن كـ ProductAdvisorResult (راجع lib/ai/validation/organizational-intelligence.ts) — unknown هنا بنفس منطق findings_json في EngineeringStageResult، عشان database.ts يفضل بدون Imports خارجية. */
export interface ProductAdvisorAnalysis {
  id: string;
  project_id: string;
  status: ProductAdvisorAnalysisStatus;
  result: unknown;
  last_error: string | null;
  generated_from_brain_version: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type KnowledgeCategory =
  | "business_pattern"
  | "architecture_decision"
  | "ux_decision"
  | "ui_pattern"
  | "reusable_component"
  | "common_requirement"
  | "common_risk"
  | "common_integration"
  | "common_bug"
  | "common_mistake"
  | "successful_solution"
  | "failed_solution"
  | "performance_lesson"
  | "security_lesson"
  | "deployment_lesson"
  | "support_lesson"
  | "customer_feedback_pattern"
  | "meeting_decision_pattern"
  | "technical_decision"
  | "best_practice";

export type KnowledgeStatus = "candidate" | "validated" | "approved" | "rejected";

export interface OrganizationalKnowledge {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  evidence: Array<{ source_type: string; detail: string }>;
  confidence_score: number;
  occurrence_count: number;
  status: KnowledgeStatus;
  approved_by: string | null;
  approved_at: string | null;
  domain: ProjectDomain | null;
  /** وزن مُتعلّم منفصل عن confidence_score الأصلي — بيزيد/بينقص مع كل قبول/رفض توصية مبنية على هذه المعرفة. */
  learned_weight: number;
  created_at: string;
  updated_at: string;
}

export type KnowledgeSourceType =
  | "brain"
  | "prd"
  | "prototype_review"
  | "developer_handoff"
  | "engineering_qa"
  | "support"
  | "production_monitoring"
  | "meeting";

export interface OrganizationalKnowledgeSource {
  id: string;
  knowledge_id: string;
  project_id: string;
  source_type: KnowledgeSourceType;
  source_reference: string;
  created_at: string;
}

export interface ProjectSimilarityMatch {
  project_id: string;
  project_name: string;
  similarity_score: number;
}

export type RecommendationCategoryV2 =
  | "business_logic"
  | "functional"
  | "non_functional"
  | "architecture"
  | "database"
  | "performance"
  | "security"
  | "scalability"
  | "integration"
  | "automation"
  | "workflow"
  | "reporting"
  | "analytics"
  | "notifications"
  | "validation"
  | "permissions"
  | "compliance"
  | "accessibility"
  | "ux"
  | "ui"
  | "ai_enhancement"
  | "future_expansion"
  | "organizational_improvement";

export type RecommendationCategory =
  | RecommendationCategoryV2
  | "features"
  | "architecture"
  | "security"
  | "performance"
  | "integrations"
  | "user_roles"
  | "business_rules"
  | "roadmap"
  | "kpis"
  | "user_stories"
  | "meeting_questions"
  | "discovery_improvements"
  | "risk_mitigation";

export type RecommendationStatus = "suggested" | "accepted" | "dismissed" | "postponed" | "needs_discussion";
export type RecommendationLevel = "critical" | "high" | "medium" | "low";
export type RecommendationValue = "high" | "medium" | "low";
export type RecommendationComplexity = "small" | "medium" | "large" | "xlarge";
export type RecommendationEvidenceSource = "similarity" | "knowledge_graph" | "both";

export interface ProjectRecommendation {
  id: string;
  project_id: string;
  category: RecommendationCategory;
  recommendation: string;
  rationale: string;
  confidence_score: number;
  supporting_project_ids: string[];
  status: RecommendationStatus;
  priority: RecommendationLevel | null;
  severity: RecommendationLevel | null;
  business_value: RecommendationValue | null;
  technical_value: RecommendationValue | null;
  affected_modules: string[];
  acceptance_criteria: string[];
  implementation_notes: string;
  potential_risks: string;
  expected_benefits: string;
  estimated_complexity: RecommendationComplexity | null;
  supporting_knowledge_node_ids: string[];
  supporting_consistency_issue_refs: unknown[];
  evidence_source: RecommendationEvidenceSource;
  version: number;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecommendationDependency {
  id: string;
  project_id: string;
  recommendation_id: string;
  depends_on_recommendation_id: string;
  created_at: string;
}

export interface RecommendationVersion {
  id: string;
  recommendation_id: string;
  project_id: string;
  version: number;
  snapshot: unknown;
  change_reason: string;
  changed_by: string | null;
  created_at: string;
}

// ============================================================
// Brain Review v2 — Executive Approval Engine (Phase 5)
// ============================================================

export type BrainReviewObjectState =
  | "pending_review"
  | "approved"
  | "approved_with_modification"
  | "needs_revision"
  | "rejected"
  | "deferred"
  | "blocked";

/** الحالات اللي بتمنع الاعتماد — pending_review/needs_revision/blocked بس. deferred و approved_with_modification متعتبرش عائق. */
export const BLOCKING_REVIEW_OBJECT_STATES: readonly BrainReviewObjectState[] = ["pending_review", "needs_revision", "blocked"];

export interface BrainReviewObject {
  id: string;
  document_id: string;
  project_id: string;
  section_key: string;
  item_key: string;
  item_title: string;
  state: BrainReviewObjectState;
  reason: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  version: number;
  needs_revalidation: boolean;
  revalidation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainReviewObjectVersion {
  id: string;
  review_object_id: string;
  document_id: string;
  project_id: string;
  version: number;
  state: BrainReviewObjectState;
  reason: string | null;
  snapshot: unknown;
  changed_by: string | null;
  created_at: string;
}

export type BrainReviewDependencyRelationType = "depends_on" | "conflicts_with" | "related_to";

export interface BrainReviewObjectDependency {
  id: string;
  document_id: string;
  project_id: string;
  review_object_id: string;
  depends_on_review_object_id: string;
  relation_type: BrainReviewDependencyRelationType;
  source: "ai_inferred" | "manual";
  created_at: string;
}

export type BrainReviewIssueType =
  | "duplicate_key"
  | "circular_dependency"
  | "orphan_relation"
  | "missing_requirement"
  | "conflicting_rule"
  | "undefined_entity"
  | "unresolved_decision"
  | "unanswered_question"
  | "security_weakness"
  | "scalability_risk"
  | "architecture_inconsistency"
  | "inconsistent_terminology"
  | "operational_readiness_gap";

export type BrainReviewIssueSeverity = "critical" | "high" | "medium" | "low";

export interface BrainReviewIssue {
  type: BrainReviewIssueType;
  severity: BrainReviewIssueSeverity;
  category: string;
  description: string;
  related_object_keys: string[];
}

export interface BrainReviewValidationReport {
  id: string;
  document_id: string;
  project_id: string;
  status: "generating" | "ready" | "failed";
  issues: BrainReviewIssue[];
  business_readiness: number | null;
  architecture_readiness: number | null;
  technical_readiness: number | null;
  ai_confidence: number | null;
  last_error: string | null;
  requested_by: string | null;
  generated_at: string;
}

export interface BrainReviewComment {
  id: string;
  document_id: string;
  project_id: string;
  review_object_id: string | null;
  parent_comment_id: string | null;
  author_id: string | null;
  body: string;
  mentions: string[];
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BrainReviewEventType =
  | "object_reviewed"
  | "comment_added"
  | "comment_resolved"
  | "validation_run"
  | "gate_checked"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "revalidation_triggered";

export interface BrainReviewEvent {
  id: string;
  document_id: string;
  project_id: string;
  event_type: BrainReviewEventType;
  actor_id: string | null;
  review_object_id: string | null;
  payload: unknown;
  created_at: string;
}

export type DecisionMemoryOutcome = "succeeded" | "failed" | "unknown";

export interface DecisionMemoryEntry {
  id: string;
  project_id: string;
  decision_title: string;
  question: string;
  rationale: string;
  outcome: DecisionMemoryOutcome;
  source_reference: string;
  created_at: string;
}

export type PromptSuggestionStatus = "suggested" | "applied" | "dismissed";

export interface PromptImprovementSuggestion {
  id: string;
  task_type: string;
  prompt_reference: string;
  suggestion: string;
  rationale: string;
  supporting_project_ids: string[];
  confidence_score: number;
  status: PromptSuggestionStatus;
  created_at: string;
}

// ============================================================
// Intelligent Navigation & Notification Routing (Enhancement Phase)
// ============================================================

export type NotificationStatus = "active" | "archived" | "deleted";
export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationEventType = "created" | "opened" | "read" | "archived" | "restored" | "deleted";

export interface NotificationRow {
  id: string;
  dedupe_key: string;
  type: string;
  category: string;
  severity: NotificationSeverity;
  project_id: string | null;
  title: string;
  message: string;
  target_url: string;
  target_module: string | null;
  target_record_id: string | null;
  target_context: Record<string, unknown>;
  status: NotificationStatus;
  source_resolved: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface NotificationRead {
  notification_id: string;
  user_id: string;
  read_at: string;
}

export interface NotificationEvent {
  id: string;
  notification_id: string;
  event_type: NotificationEventType;
  actor_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Project Brain Synchronization Engine (Phase 3 Enhancement)
// ============================================================

export type BrainKnowledgeSourceType =
  | "meeting_transcript"
  | "meeting_ai_analysis"
  | "manual_note"
  | "prototype_review"
  | "support_feedback"
  | "meeting_review";

export type BrainChangeBatchStatus = "pending" | "reviewed";

export interface BrainChangeBatch {
  id: string;
  project_id: string;
  source_type: BrainKnowledgeSourceType;
  source_reference: string;
  summary: string;
  status: BrainChangeBatchStatus;
  created_at: string;
}

export type BrainPendingChangeType = "add" | "modify" | "remove";
export type BrainPendingChangeStatus = "pending" | "accepted" | "rejected" | "merged";

export interface BrainPendingChange {
  id: string;
  batch_id: string;
  project_id: string;
  section_key: string;
  change_type: BrainPendingChangeType;
  source_type: BrainKnowledgeSourceType;
  source_reference: string;
  confidence_score: number;
  old_value: unknown;
  new_value: unknown;
  item_label: string;
  conflict: boolean;
  status: BrainPendingChangeStatus;
  rationale: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface BrainKnowledgeGraphEdge {
  id: string;
  project_id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation_type: string;
  created_at: string;
}

// ============================================================
// Meeting Presentation (Phase 3 Part 2)
// ============================================================

export type MeetingPresentationStatus = "draft" | "generating" | "ready" | "failed";

export type SeverityLevel = "low" | "medium" | "high" | "critical";
export type PriorityLevel = "low" | "medium" | "high";
export type ComplexityLevel = "XS" | "S" | "M" | "L" | "XL";

export interface CoverSlideContent {
  project_name: string;
  client_name: string;
  meeting_date: string | null;
  pm_name: string;
  current_phase: string;
  status: string;
  progress_percent: number;
}

export interface ExecutiveSummarySlideContent {
  summary: string;
  key_points: string[];
}

export interface TimelineEntry {
  label: string;
  date: string | null;
}

export interface PainPointItem {
  title: string;
  severity: SeverityLevel;
}

export interface BusinessProblemSlideContent {
  problem_statement: string;
  timeline: TimelineEntry[];
  pain_points: PainPointItem[];
  business_impact: string;
}

export interface GoalItem {
  title: string;
  priority: PriorityLevel;
  progress_percent: number;
  expected_outcome: string;
}

export interface KpiItem {
  name: string;
  target: string;
}

export interface BusinessGoalsSlideContent {
  goals: GoalItem[];
  kpis: KpiItem[];
}

export interface WorkflowStep {
  title: string;
  description: string;
}

export interface CurrentWorkflowSlideContent {
  steps: WorkflowStep[];
}

export interface FutureWorkflowSlideContent {
  steps: WorkflowStep[];
  improvements: string[];
}

export interface ActorCard {
  name: string;
  responsibilities: string[];
  permissions: string[];
  pain_points: string[];
}

export interface ActorsSlideContent {
  actors: ActorCard[];
}

export interface ModuleItem {
  name: string;
  purpose: string;
  priority: PriorityLevel;
  complexity: ComplexityLevel;
  dependencies: string[];
}

export interface ModulesSlideContent {
  modules: ModuleItem[];
}

export interface ScreenCard {
  name: string;
  goal: string;
  functions: string[];
}

export interface ScreensSlideContent {
  screens: ScreenCard[];
}

export interface ArchitectureSlideContent {
  frontend: string;
  backend: string;
  database: string;
  storage: string;
  authentication: string;
  integrations: string[];
}

export interface MilestoneItem {
  title: string;
  date: string | null;
  progress_percent: number;
}

export interface TimelineSlideContent {
  milestones: MilestoneItem[];
}

export interface RiskItem {
  title: string;
  probability: PriorityLevel;
  impact: PriorityLevel;
  mitigation: string;
}

export interface RisksSlideContent {
  risks: RiskItem[];
}

export interface MeetingOpenQuestionItem {
  question: string;
  context: string;
}

export interface OpenQuestionsSlideContent {
  questions: MeetingOpenQuestionItem[];
}

export interface ClientDecisionItem {
  decision: string;
  date: string | null;
  rationale: string;
}

export interface ClientDecisionsSlideContent {
  decisions: ClientDecisionItem[];
}

export interface FinalSummarySlideContent {
  next_steps: string[];
  meeting_objectives: string[];
  closing_note: string;
}

/**
 * الديك الكامل — 15 شريحة، كل واحدة بشكل مختلف يعكس طبيعتها (مش نص
 * موحّد {heading,body,bullets} زي التصميم القديم). كل الحقول Optional
 * (Partial) عشان تفضل الشرائح موجودة تدريجيًا وقت التوليد أو التعديل
 * اليدوي الجزئي.
 */
export interface MeetingPresentationSlides {
  cover?: CoverSlideContent;
  executive_summary?: ExecutiveSummarySlideContent;
  business_problem?: BusinessProblemSlideContent;
  business_goals?: BusinessGoalsSlideContent;
  current_workflow?: CurrentWorkflowSlideContent;
  future_workflow?: FutureWorkflowSlideContent;
  actors?: ActorsSlideContent;
  modules?: ModulesSlideContent;
  screens?: ScreensSlideContent;
  architecture?: ArchitectureSlideContent;
  timeline?: TimelineSlideContent;
  risks?: RisksSlideContent;
  open_questions?: OpenQuestionsSlideContent;
  client_decisions?: ClientDecisionsSlideContent;
  final_summary?: FinalSummarySlideContent;
}

export type MeetingPresentationSlideKey = keyof MeetingPresentationSlides;

export interface MeetingPresentation {
  id: string;
  project_id: string;
  meeting_id: string | null;
  title: string;
  meeting_date: string | null;
  status: MeetingPresentationStatus;
  version: number;
  slides: MeetingPresentationSlides;
  overall_confidence: number | null;
  last_error: string | null;
  generation_claimed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingPresentationVersion {
  id: string;
  project_id: string;
  presentation_id: string;
  version: number;
  reason: string;
  slide_regenerated: MeetingPresentationSlideKey | null;
  created_by: string | null;
  created_at: string;
}

export type MeetingLiveSessionStatus = "active" | "ended";

export interface MeetingLiveSession {
  id: string;
  project_id: string;
  presentation_id: string;
  meeting_id: string;
  status: MeetingLiveSessionStatus;
  current_slide_index: number;
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
}

export type MeetingLiveCaptureType =
  | "decision"
  | "risk"
  | "requirement"
  | "idea"
  | "question"
  | "action_item"
  | "client_feedback"
  | "business_rule"
  | "pain_point"
  | "constraint"
  | "dependency";

export interface MeetingLiveCapture {
  id: string;
  project_id: string;
  session_id: string;
  meeting_id: string;
  capture_type: MeetingLiveCaptureType;
  text: string;
  created_by: string | null;
  created_at: string;
}

export type MeetingReviewStatus = "generating" | "ready" | "failed";

export interface MeetingReviewPlanSnapshot {
  agenda: string[];
  questions: string[];
  openDecisions: string[];
}

export interface MeetingReview {
  id: string;
  project_id: string;
  meeting_id: string;
  presentation_id: string | null;
  status: MeetingReviewStatus;
  plan_snapshot: MeetingReviewPlanSnapshot;
  discussed: string[];
  not_discussed: string[];
  open_questions: string[];
  new_decisions: string[];
  new_tasks: string[];
  new_risks: string[];
  new_assumptions: string[];
  last_error: string | null;
  created_at: string;
}

export type MeetingLifecycleEventType =
  | "planned"
  | "started"
  | "finished"
  | "transcript_uploaded"
  | "analysis_completed"
  | "brain_updated"
  | "presentation_updated";

export interface MeetingLifecycleEvent {
  id: string;
  project_id: string;
  meeting_id: string;
  event_type: MeetingLifecycleEventType;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

// ============================================================
// AI Code Execution Engine (Phase X — البرومت 2)
// ============================================================

export type ExecutionPlanStatus = "idle" | "planning" | "ready" | "executing" | "completed" | "failed";

export interface ExecutionPlan {
  id: string;
  project_id: string;
  prototype_prompt_version: number;
  repo_url: string;
  repo_branch: string;
  status: ExecutionPlanStatus;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExecutionTaskStatus = "pending" | "running" | "completed" | "failed";

export interface ExecutionTask {
  id: string;
  plan_id: string;
  project_id: string;
  task_order: number;
  title: string;
  description: string;
  target_file_hints: string[];
  status: ExecutionTaskStatus;
  retry_count: number;
  claude_response_summary: string | null;
  files_modified: string[];
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_seconds: number | null;
  last_error: string | null;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export type QaFixLoopStage = "engineering_qa" | "accessibility_qa";
export type QaFixLoopStatus = "running" | "fixed" | "failed" | "max_attempts_reached";

export interface QaFixLoop {
  id: string;
  plan_id: string;
  project_id: string;
  qa_stage: QaFixLoopStage;
  attempt_number: number;
  status: QaFixLoopStatus;
  qa_reference_id: string | null;
  findings_summary: string | null;
  fix_prompt: string | null;
  fix_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessibilityViolation {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodesCount: number;
  targetSelectors: string[];
}

export type AccessibilityScanStatus = "running" | "ready" | "failed";

export interface AccessibilityScan {
  id: string;
  plan_id: string;
  project_id: string;
  status: AccessibilityScanStatus;
  violations: AccessibilityViolation[];
  violations_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ReleaseCandidateStatus = "pending" | "blocked" | "ready";

export interface ReleaseCandidate {
  id: string;
  plan_id: string;
  project_id: string;
  status: ReleaseCandidateStatus;
  engineering_qa_passed: boolean;
  accessibility_qa_passed: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Meeting Intelligence System (Phase 2) — عناصر الاجتماع كصفوف حقيقية
// بدل jsonb blobs، زائد مرفقات عامة وربط تجهيز الاجتماع بالمشاركين/
// العناصر المطلوبة. migration 0050_meeting_intelligence_phase2.sql.
// ============================================================

export interface MeetingPrepParticipant {
  id: string;
  meeting_preparation_id: string;
  project_id: string;
  full_name: string;
  role: string;
  is_client: boolean;
  is_required: boolean;
  created_at: string;
}

export type MeetingRequiredItemType = "file" | "image" | "document" | "spreadsheet";

export interface MeetingRequiredItem {
  id: string;
  meeting_preparation_id: string;
  project_id: string;
  item_type: MeetingRequiredItemType;
  title: string;
  description: string;
  is_provided: boolean;
  provided_attachment_id: string | null;
  created_at: string;
}

export type MeetingAttachmentFileType = "image" | "pdf" | "docx" | "xlsx" | "csv" | "other";
export type MeetingAttachmentAiStatus = "pending" | "analyzing" | "ready" | "failed" | "unsupported";

export interface MeetingAttachment {
  id: string;
  meeting_id: string | null;
  meeting_preparation_id: string | null;
  project_id: string;
  title: string;
  description: string;
  file_type: MeetingAttachmentFileType;
  storage_path: string;
  file_size_bytes: number;
  uploaded_by: string | null;
  uploaded_at: string;
  ai_status: MeetingAttachmentAiStatus;
  ai_summary: string | null;
  ai_confidence: number | null;
  extracted_entities: Record<string, unknown>;
  related_decision_ids: string[];
  related_requirement_ids: string[];
  related_risk_ids: string[];
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type MeetingDecisionStatus = "active" | "superseded";

export interface MeetingDecision {
  id: string;
  meeting_id: string;
  project_id: string;
  text: string;
  confidence_score: number;
  evidence_quote: string | null;
  speaker_guess: string | null;
  status: MeetingDecisionStatus;
  superseded_by_id: string | null;
  previous_value: string | null;
  change_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export type MeetingRequirementType = "functional" | "non_functional";

export interface MeetingRequirement {
  id: string;
  meeting_id: string;
  project_id: string;
  text: string;
  requirement_type: MeetingRequirementType;
  confidence_score: number;
  evidence_quote: string | null;
  created_at: string;
}

export interface MeetingRisk {
  id: string;
  meeting_id: string;
  project_id: string;
  text: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence_score: number;
  evidence_quote: string | null;
  created_at: string;
}

export interface MeetingQuestion {
  id: string;
  meeting_id: string;
  project_id: string;
  text: string;
  status: "open" | "answered";
  answer: string | null;
  confidence_score: number;
  evidence_quote: string | null;
  created_at: string;
}

export interface MeetingTask {
  id: string;
  meeting_id: string;
  project_id: string;
  text: string;
  owner: string | null;
  due_hint: string | null;
  priority: "high" | "medium" | "low";
  confidence_score: number;
  evidence_quote: string | null;
  created_at: string;
}

export type MeetingExtractedItemCategory =
  | "business_rule"
  | "pain_point"
  | "constraint"
  | "idea"
  | "dependency"
  | "conflict"
  | "missing_information";

export interface MeetingExtractedItem {
  id: string;
  meeting_id: string;
  project_id: string;
  category: MeetingExtractedItemCategory;
  text: string;
  confidence_score: number;
  evidence_quote: string | null;
  created_at: string;
}

export interface MeetingAiResult {
  id: string;
  meeting_id: string;
  project_id: string;
  pipeline_version: string;
  raw_ai_output: Record<string, unknown>;
  confidence_overall: number | null;
  generated_at: string;
}

export interface MeetingKnowledgeSearchResult {
  source_table: string;
  id: string;
  meeting_id: string;
  text: string;
  rank: number;
}

/** عنصر مُستخرج واحد بمعيار الثقة/الدليل — الوحدة الأساسية لكل الـ 13 فئة في MeetingExtractionV2. */
export interface ExtractedItemV2 {
  text: string;
  confidence_score: number;
  evidence_quote: string | null;
  speaker_guess: string | null;
}

export const MEETING_EXTRACTION_V2_CATEGORIES = [
  "decisions",
  "functional_requirements",
  "non_functional_requirements",
  "business_rules",
  "pain_points",
  "risks",
  "constraints",
  "questions",
  "ideas",
  "tasks",
  "dependencies",
  "conflicts",
  "missing_information",
] as const;

export type MeetingExtractionV2Category = (typeof MEETING_EXTRACTION_V2_CATEGORIES)[number];

export type MeetingExtractionV2 = Record<MeetingExtractionV2Category, ExtractedItemV2[]> & {
  overall_confidence: number;
};

// ============================================================
// Knowledge Graph (Phase 3) — طبقة مُشتقّة من Project Brain v2، عنصر
// معرفة مستقل لكل بند بدل مستوى القسم كله. migration
// 0051_knowledge_graph_phase3.sql.
// ============================================================

export type ProjectDomain =
  | "erp"
  | "crm"
  | "lms"
  | "healthcare"
  | "legal"
  | "construction"
  | "hospital"
  | "ecommerce"
  | "restaurant"
  | "factory"
  | "clinic"
  | "school"
  | "warehouse"
  | "accounting"
  | "generic";

export type KnowledgeNodeSourceType = "brain_section" | "meeting" | "discovery" | "manual" | "attachment";
export type KnowledgeNodeImportance = "critical" | "high" | "medium" | "low";
export type KnowledgeNodePriority = "high" | "medium" | "low";
export type KnowledgeNodeStatus = "active" | "needs_review" | "needs_regeneration" | "rejected" | "superseded";

export interface KnowledgeNode {
  id: string;
  project_id: string;
  category: string;
  item_key: string;
  title: string;
  description: string;
  source_type: KnowledgeNodeSourceType;
  source_reference: string | null;
  confidence_score: number;
  importance: KnowledgeNodeImportance;
  priority: KnowledgeNodePriority;
  status: KnowledgeNodeStatus;
  version: number;
  superseded_by_id: string | null;
  previous_value: unknown;
  author_id: string | null;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEvidence {
  id: string;
  node_id: string;
  quote: string;
  source_module: string | null;
  source_meeting_id: string | null;
  source_transcript_timestamp: string | null;
  supporting_attachment_id: string | null;
  supporting_note_id: string | null;
  supporting_discovery_answer_key: string | null;
  created_at: string;
}

export type KnowledgeRelationType = "depends_on" | "related_to" | "blocks" | "part_of" | "conflicts_with";

export interface KnowledgeRelation {
  id: string;
  project_id: string;
  from_node_id: string;
  to_node_id: string;
  relation_type: KnowledgeRelationType;
  inferred_by: "ai" | "manual";
  created_at: string;
}

export interface KnowledgeVersion {
  id: string;
  node_id: string;
  project_id: string;
  version: number;
  snapshot: unknown;
  change_reason: string;
  changed_by: string | null;
  created_at: string;
}

export interface KnowledgeConsistencyIssue {
  type:
    | "duplicate_key"
    | "circular_dependency"
    | "orphan_relation"
    | "domain_gap"
    | "inconsistent_terminology"
    | "semantic_duplicate";
  severity: "high" | "medium" | "low";
  description: string;
  node_ids: string[];
}

export interface KnowledgeConsistencyReport {
  id: string;
  project_id: string;
  status: "generating" | "ready" | "failed";
  issues: KnowledgeConsistencyIssue[];
  domain_gaps: string[];
  relations_inferred_count: number;
  last_error: string | null;
  requested_by: string | null;
  generated_at: string;
}

export interface ProjectKnowledgeSearchResult {
  id: string;
  category: string;
  title: string;
  description: string;
  confidence_score: number;
  status: string;
  similarity: number;
}
