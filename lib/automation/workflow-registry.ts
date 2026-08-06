import type { AutomationEvent, EventType } from "./events";
import { EVENT_TYPES, payloadString } from "./events";
import type { NotificationSeverity, TaskPriority, TaskSourceType } from "@/lib/types/database";
import type { AuthAuditAction } from "@/lib/auth/audit";

/**
 * سجل الـ Workflows (pure, معرّف في الكود). كل Workflow = محفّز (حدث) +
 * شرط اختياري + دالة تبني قائمة الإجراءات من الحدث. الفصل ده بيخلّي كل
 * منطق القرار قابل للاختبار بالكامل، والمنفّذ (actions.ts) بس بينفّذ
 * ما ترجعه buildActions. (مصمّم Workflows قابل للتهيئة من قاعدة البيانات
 * عبر واجهة — مؤجّل للمرحلة القادمة؛ القواعد في الكود هي الجوهر القوي.)
 */

export type ActionSpec =
  | {
      kind: "notify";
      dedupeKey: string;
      type: string;
      category: string;
      severity: NotificationSeverity;
      projectId: string | null;
      recordId: string | null;
      title: string;
      message: string;
    }
  | {
      kind: "create_task";
      projectId: string;
      title: string;
      description?: string;
      priority: TaskPriority;
      sourceType: Exclude<TaskSourceType, "manual">;
      sourceReference: string;
    }
  | {
      kind: "timeline";
      projectId: string | null;
      action: AuthAuditAction;
      details: Record<string, unknown>;
    };

export interface WorkflowDefinition {
  id: string;
  title: string;
  description: string;
  trigger: EventType;
  /** شرط نقي على الحدث — لو رجّع false يُتخطّى الـ Workflow (status=skipped). */
  condition?: (event: AutomationEvent) => boolean;
  /** يبني قائمة الإجراءات المُحلّة من الحدث. */
  buildActions: (event: AutomationEvent) => ActionSpec[];
}

function timeline(event: AutomationEvent, workflowId: string, extra: Record<string, unknown> = {}): ActionSpec {
  return {
    kind: "timeline",
    projectId: event.projectId,
    action: "workflow_executed",
    details: { workflow: workflowId, event: event.type, record_id: event.recordId, ...extra },
  };
}

export const WORKFLOW_REGISTRY: WorkflowDefinition[] = [
  {
    id: "wf_task_completed",
    title: "اكتمال مهمة",
    description: "عند اكتمال مهمة: تسجيل في الـ Timeline لتغذية الذكاء التنظيمي (بدون إزعاج بإشعار).",
    trigger: EVENT_TYPES.TASK_COMPLETED,
    buildActions: (e) => [timeline(e, "wf_task_completed", { title: payloadString(e.payload, "title") })],
  },
  {
    id: "wf_delivery_approved",
    title: "اعتماد مرحلة تسليم",
    description: "عند اعتماد مرحلة تسليم: إشعار الفريق + تسجيل في الـ Timeline.",
    trigger: EVENT_TYPES.DELIVERY_APPROVED,
    condition: (e) => {
      const s = payloadString(e.payload, "status");
      return s === "approved" || s === "client_approved" || s === "manager_approved";
    },
    buildActions: (e) => {
      const title = payloadString(e.payload, "milestoneTitle", "مرحلة تسليم");
      const project = payloadString(e.payload, "projectName", "المشروع");
      const acts: ActionSpec[] = [];
      if (e.projectId) {
        acts.push({
          kind: "notify",
          dedupeKey: `auto-delivery-approved-${e.recordId ?? e.projectId}`,
          type: "delivery_approved",
          category: "delivery",
          severity: "info",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "تم اعتماد مرحلة تسليم",
          message: `اعتُمدت مرحلة "${title}" في مشروع "${project}"`,
        });
      }
      acts.push(timeline(e, "wf_delivery_approved", { milestone: title }));
      return acts;
    },
  },
  {
    id: "wf_delivery_rejected",
    title: "طلب تعديل على مرحلة تسليم",
    description: "عند رفض/طلب تعديل مرحلة: مهمة معالجة + إشعار + Timeline.",
    trigger: EVENT_TYPES.DELIVERY_REJECTED,
    condition: (e) => {
      const s = payloadString(e.payload, "status");
      return s === "needs_revision" || s === "rejected" || s === "changes_requested";
    },
    buildActions: (e) => {
      const title = payloadString(e.payload, "milestoneTitle", "مرحلة تسليم");
      const project = payloadString(e.payload, "projectName", "المشروع");
      const acts: ActionSpec[] = [];
      if (e.projectId && e.recordId) {
        acts.push({
          kind: "create_task",
          projectId: e.projectId,
          title: `معالجة ملاحظات اعتماد: ${title}`,
          description: "طُلبت تعديلات على مرحلة التسليم — تمّت الإحالة تلقائيًا.",
          priority: "high",
          sourceType: "requirement",
          sourceReference: `delivery-changes-${e.recordId}`,
        });
        acts.push({
          kind: "notify",
          dedupeKey: `auto-delivery-rejected-${e.recordId}`,
          type: "delivery_rejected",
          category: "delivery",
          severity: "warning",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "طُلبت تعديلات على مرحلة تسليم",
          message: `مرحلة "${title}" في "${project}" تحتاج معالجة ملاحظات`,
        });
      }
      acts.push(timeline(e, "wf_delivery_rejected", { milestone: title }));
      return acts;
    },
  },
  {
    id: "wf_engineering_qa_failed",
    title: "إخفاق المراجعة الهندسية",
    description: "عند فشل مراجعة هندسية: مهمة إصلاح حرجة + إشعار حرج + Timeline.",
    trigger: EVENT_TYPES.ENGINEERING_QA_FAILED,
    buildActions: (e) => {
      const project = payloadString(e.payload, "projectName", "المشروع");
      const reviewNo = payloadString(e.payload, "reviewNumber", "");
      const acts: ActionSpec[] = [];
      if (e.projectId && e.recordId) {
        acts.push({
          kind: "create_task",
          projectId: e.projectId,
          title: `إصلاح إخفاق المراجعة الهندسية${reviewNo ? ` #${reviewNo}` : ""}`,
          priority: "critical",
          sourceType: "eqa_finding",
          sourceReference: `eqa-failed-${e.recordId}`,
        });
        acts.push({
          kind: "notify",
          dedupeKey: `auto-eqa-failed-${e.recordId}`,
          type: "engineering_review_failed",
          category: "qa",
          severity: "critical",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "فشلت مراجعة هندسية",
          message: `مراجعة هندسية${reviewNo ? ` رقم ${reviewNo}` : ""} في "${project}" فشلت — أُنشئت مهمة إصلاح`,
        });
      }
      acts.push(timeline(e, "wf_engineering_qa_failed"));
      return acts;
    },
  },
  {
    id: "wf_discovery_analysis_completed",
    title: "اكتمال تحليل الاكتشاف",
    description: "عند اكتمال تحليل اكتشاف: مهمة مراجعة النتيجة + إشعار + Timeline.",
    trigger: EVENT_TYPES.DISCOVERY_ANALYSIS_COMPLETED,
    buildActions: (e) => {
      const project = payloadString(e.payload, "projectName", "المشروع");
      const acts: ActionSpec[] = [];
      if (e.projectId && e.recordId) {
        acts.push({
          kind: "create_task",
          projectId: e.projectId,
          title: "مراجعة نتيجة تحليل الاكتشاف",
          priority: "medium",
          sourceType: "requirement",
          sourceReference: `discovery-analysis-${e.recordId}`,
        });
        acts.push({
          kind: "notify",
          dedupeKey: `auto-analysis-done-${e.recordId}`,
          type: "discovery_analysis_completed",
          category: "discovery",
          severity: "info",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "تحليل الاكتشاف جاهز",
          message: `اكتمل تحليل مشروع "${project}" — جاهز للمراجعة`,
        });
      }
      acts.push(timeline(e, "wf_discovery_analysis_completed"));
      return acts;
    },
  },
  {
    id: "wf_monitoring_critical",
    title: "حادثة إنتاج حرجة",
    description: "عند حادثة إنتاج حرجة: مهمة معالجة حرجة + إشعار حرج + Timeline.",
    trigger: EVENT_TYPES.MONITORING_CRITICAL_INCIDENT,
    buildActions: (e) => {
      const project = payloadString(e.payload, "projectName", "المشروع");
      const incidentTitle = payloadString(e.payload, "incidentTitle", "حادثة إنتاج");
      const acts: ActionSpec[] = [];
      if (e.projectId && e.recordId) {
        acts.push({
          kind: "create_task",
          projectId: e.projectId,
          title: `معالجة حادثة إنتاج: ${incidentTitle}`,
          priority: "critical",
          sourceType: "incident",
          sourceReference: `incident-${e.recordId}`,
        });
        acts.push({
          kind: "notify",
          dedupeKey: `auto-incident-${e.recordId}`,
          type: "monitoring_critical_incident",
          category: "monitoring",
          severity: "critical",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "حادثة إنتاج حرجة",
          message: `حادثة حرجة في "${project}": ${incidentTitle}`,
        });
      }
      acts.push(timeline(e, "wf_monitoring_critical"));
      return acts;
    },
  },
  {
    id: "wf_project_member_added",
    title: "إضافة عضو للمشروع",
    description: "عند إضافة عضو: إشعار ترحيبي + تسجيل في الـ Timeline.",
    trigger: EVENT_TYPES.PROJECT_MEMBER_ADDED,
    buildActions: (e) => {
      const project = payloadString(e.payload, "projectName", "المشروع");
      const memberName = payloadString(e.payload, "memberName", "عضو جديد");
      const acts: ActionSpec[] = [];
      if (e.projectId) {
        acts.push({
          kind: "notify",
          dedupeKey: `auto-member-added-${e.recordId ?? memberName}-${e.projectId}`,
          type: "project_member_added",
          category: "work",
          severity: "info",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "عضو جديد في المشروع",
          message: `انضمّ "${memberName}" إلى فريق مشروع "${project}"`,
        });
      }
      acts.push(timeline(e, "wf_project_member_added", { member: memberName }));
      return acts;
    },
  },
  {
    id: "wf_brain_approved",
    title: "اعتماد Project Brain",
    description: "عند اعتماد Brain: إشعار الفريق + تسجيل في الـ Timeline.",
    trigger: EVENT_TYPES.BRAIN_APPROVED,
    buildActions: (e) => {
      const project = payloadString(e.payload, "projectName", "المشروع");
      const version = payloadString(e.payload, "version", "");
      const acts: ActionSpec[] = [];
      if (e.projectId) {
        acts.push({
          kind: "notify",
          dedupeKey: `auto-brain-approved-${e.recordId ?? e.projectId}`,
          type: "brain_approved",
          category: "brain",
          severity: "info",
          projectId: e.projectId,
          recordId: e.recordId,
          title: "تم اعتماد Project Brain",
          message: `اعتُمد Project Brain${version ? ` v${version}` : ""} لمشروع "${project}"`,
        });
      }
      acts.push(timeline(e, "wf_brain_approved"));
      return acts;
    },
  },
];

/** كل الـ Workflows اللي بتستجيب لنوع حدث معيّن. */
export function workflowsForEvent(type: EventType): WorkflowDefinition[] {
  return WORKFLOW_REGISTRY.filter((w) => w.trigger === type);
}

/** يقرّر إن كان Workflow هيشتغل للحدث ده (شرطه محقّق). */
export function shouldRun(workflow: WorkflowDefinition, event: AutomationEvent): boolean {
  return workflow.condition ? workflow.condition(event) : true;
}
