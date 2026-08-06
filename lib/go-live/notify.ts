import { NotificationService } from "@/lib/notifications/service";

/**
 * إشعارات مركز الإطلاق → Director/Admin/Project Manager (على مستوى المؤسسة؛
 * الوصول محصور بالأدوار). أحداث: بدء التحقّق/اعتماد قسم/اعتماد فرع/مشكلة/
 * جاهز للإطلاق/اعتماد الإطلاق.
 */

export type GoLiveEvent =
  | "verification_started" | "department_approved" | "branch_approved"
  | "issue_reported" | "go_live_ready" | "go_live_approved";

const META: Record<GoLiveEvent, { title: string; severity: "info" | "warning" | "critical" }> = {
  verification_started: { title: "بدأ التحقّق بعد الترحيل", severity: "info" },
  department_approved: { title: "اعتمد قسم بياناته", severity: "info" },
  branch_approved: { title: "اعتمد فرع بياناته", severity: "info" },
  issue_reported: { title: "مشكلة مُبلَّغة في التحقّق", severity: "warning" },
  go_live_ready: { title: "النظام جاهز للإطلاق", severity: "info" },
  go_live_approved: { title: "صدرت شهادة الإطلاق", severity: "info" },
};

export async function notifyGoLive(event: GoLiveEvent, verificationId: string, message: string, projectId: string | null): Promise<void> {
  const meta = META[event];
  try {
    await NotificationService.emit({
      dedupeKey: `go_live:${verificationId}:${event}:${message.slice(0, 24)}`,
      type: "go_live",
      category: "migration",
      severity: meta.severity,
      title: meta.title,
      message,
      targetUrl: "/dashboard/go-live",
      projectId: projectId ?? undefined,
      targetModule: "go-live",
      targetRecordId: verificationId,
    });
  } catch {
    /* الإشعار best-effort */
  }
}
