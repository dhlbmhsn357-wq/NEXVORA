import { NotificationService } from "@/lib/notifications/service";
import type { AuditEventType } from "./audit";

/**
 * إشعارات دورة حياة الترحيل → Director/Admin (الإشعارات على مستوى المؤسسة؛
 * الوصول للوحة محصور بالأدوار). أحداث: بدء/إيقاف/فشل/اكتمال/تراجع.
 */

const TITLES: Partial<Record<AuditEventType, { title: string; severity: "info" | "warning" | "critical" }>> = {
  execution_started: { title: "بدأ الترحيل الحقيقي", severity: "info" },
  paused: { title: "أُوقِف الترحيل مؤقتًا", severity: "warning" },
  failed: { title: "فشل الترحيل", severity: "critical" },
  completed: { title: "اكتمل الترحيل بنجاح", severity: "info" },
  rollback_started: { title: "بدأ التراجع", severity: "warning" },
  rollback_completed: { title: "اكتمل التراجع", severity: "info" },
  aborted: { title: "أُجهِض الترحيل", severity: "warning" },
};

export async function notifyExecution(event: AuditEventType, executionId: string, message: string, projectId: string | null): Promise<void> {
  const meta = TITLES[event];
  if (!meta) return;
  try {
    await NotificationService.emit({
      dedupeKey: `migration_execution:${executionId}:${event}`,
      type: "migration_execution",
      category: "migration",
      severity: meta.severity,
      title: meta.title,
      message,
      targetUrl: "/dashboard/production-migration",
      projectId: projectId ?? undefined,
      targetModule: "production-migration",
      targetRecordId: executionId,
    });
  } catch {
    /* الإشعار best-effort */
  }
}
