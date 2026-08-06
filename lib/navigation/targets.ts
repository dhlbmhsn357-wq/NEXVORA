/**
 * Navigation Service — المصدر الوحيد لبناء أي رابط تنقّل عميق (Deep
 * Link) في المنصة كلها. ممنوع أي مكان تاني يبني مسار Project/Tab/
 * Highlight يدويًا — كل حاجة لازم تمر من هنا (نفس فلسفة AIService في
 * طبقة الـ AI: نقطة دخول واحدة بدل منطق متكرر في كل صفحة).
 *
 * تنسيق الرابط: /dashboard/projects/{id}?tab={tabKey}&highlight={recordId}
 * — بيستخدم نفس مفاتيح Tabs الموجودة فعليًا في project-tabs.tsx حرفيًا،
 * فأي تغيير في اسم Tab هناك لازم ينعكس هنا (والعكس).
 */

export type ProjectTabKey =
  | "overview"
  | "discoveryAnalysis"
  | "meetingPrep"
  | "meetingPresentation"
  | "meetings"
  | "brain"
  | "brainReview"
  | "prd"
  | "prototypePrompt"
  | "review"
  | "presentation"
  | "developerHandoff"
  | "engineeringQA"
  | "productionMonitoring"
  | "organizationalIntelligence"
  | "support"
  | "deliveryMilestones"
  | "tasks"
  | "activity";

export interface NavigationTarget {
  url: string;
  tab: ProjectTabKey | null;
  highlight: string | null;
}

function buildProjectUrl(projectId: string, tab: ProjectTabKey | null, highlight?: string | null): string {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (highlight) params.set("highlight", highlight);
  const qs = params.toString();
  return `/dashboard/projects/${projectId}${qs ? `?${qs}` : ""}`;
}

/**
 * خريطة ثابتة من نوع الإشعار لتبويب المشروع الصحيح — مصدر الحقيقة
 * الوحيد لهذا الربط. أي نوع إشعار جديد مستقبلًا لازم يُضاف هنا بس.
 */
const NOTIFICATION_TYPE_TAB: Record<string, ProjectTabKey> = {
  blocked_review: "review",
  pending_support: "support",
  discovery_submitted: "overview",
  discovery_activity: "overview",
  discovery_expired: "overview",
  whatsapp_send_failed: "overview",
  discovery_analysis_completed: "discoveryAnalysis",
  discovery_analysis_failed: "discoveryAnalysis",
  brain_draft_created: "brain",
  brain_in_review: "brainReview",
  brain_changes_requested: "brainReview",
  brain_approved: "brain",
  brain_rejected: "brain",
  engineering_review_failed: "engineeringQA",
  engineering_review_needs_review: "engineeringQA",
  monitoring_critical_incident: "productionMonitoring",
  brain_pending_change: "brain",
  meeting_lifecycle: "meetingPresentation",
  milestone_due: "deliveryMilestones",
  task_overdue: "tasks",
};

export interface NotificationTargetInput {
  type: string;
  projectId: string | null;
  recordId?: string | null;
}

/** يبني رابط التنقّل العميق لإشعار — يُستخدم وقت إنشاء الإشعار (تخزين target_url) ووقت العرض. */
export function resolveNotificationTarget(input: NotificationTargetInput): NavigationTarget {
  if (input.type === "knowledge_needs_approval") {
    return { url: "/dashboard/organizational-intelligence", tab: null, highlight: input.recordId ?? null };
  }

  if (!input.projectId) {
    return { url: "/dashboard/projects", tab: null, highlight: null };
  }

  const tab = NOTIFICATION_TYPE_TAB[input.type] ?? "overview";
  return { url: buildProjectUrl(input.projectId, tab, input.recordId), tab, highlight: input.recordId ?? null };
}

/** رابط تبويب مشروع مباشر — يُستخدم من بطاقات Dashboard اللي بتشاور على مشروع واحد بعينه. */
export function projectTabUrl(projectId: string, tab: ProjectTabKey, highlight?: string | null): string {
  return buildProjectUrl(projectId, tab, highlight);
}
