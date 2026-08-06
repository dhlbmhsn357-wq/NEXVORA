import { NotificationService } from "@/lib/notifications/service";

/**
 * إشعارات Hypercare → Director/Admin/Project Manager (على مستوى المؤسسة؛
 * الوصول محصور بالأدوار). أحداث: حادثة حرجة/هبوط صحة/توصية كبيرة/اقتراح
 * معرفة/تعافٍ/اكتمال تحسين.
 */

export type HypercareEvent =
  | "critical_incident" | "health_drop" | "major_recommendation"
  | "knowledge_suggestion" | "system_recovery" | "optimization_completed" | "hypercare_closed";

const META: Record<HypercareEvent, { title: string; severity: "info" | "warning" | "critical" }> = {
  critical_incident: { title: "حادثة حرجة في Hypercare", severity: "critical" },
  health_drop: { title: "هبوط في درجة الصحة", severity: "warning" },
  major_recommendation: { title: "توصية تحسين مهمّة", severity: "info" },
  knowledge_suggestion: { title: "اقتراح معرفة للمراجعة", severity: "info" },
  system_recovery: { title: "تعافى النظام", severity: "info" },
  optimization_completed: { title: "اكتمل تحسين", severity: "info" },
  hypercare_closed: { title: "أُغلق Hypercare وأُنجِز المشروع", severity: "info" },
};

export async function notifyHypercare(event: HypercareEvent, periodId: string, message: string, projectId: string | null): Promise<void> {
  const meta = META[event];
  try {
    await NotificationService.emit({
      dedupeKey: `hypercare:${periodId}:${event}:${message.slice(0, 24)}`,
      type: "hypercare",
      category: "migration",
      severity: meta.severity,
      title: meta.title,
      message,
      targetUrl: "/dashboard/hypercare",
      projectId: projectId ?? undefined,
      targetModule: "hypercare",
      targetRecordId: periodId,
    });
  } catch {
    /* الإشعار best-effort */
  }
}
