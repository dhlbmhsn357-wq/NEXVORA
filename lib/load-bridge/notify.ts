import { NotificationService } from "@/lib/notifications/service";

/** إشعارات جسر الحمل → Director/Admin. */
export async function notifyLoad(
  kind: "package_ready" | "load_partial" | "reconcile_mismatch",
  runId: string,
  message: string,
  projectId: string | null
): Promise<void> {
  const meta: Record<typeof kind, { title: string; severity: "info" | "warning" | "critical" }> = {
    package_ready: { title: "حزمة الحمل جاهزة للتنزيل", severity: "info" },
    load_partial: { title: "حمل جزئي — يحتاج مراجعة", severity: "warning" },
    reconcile_mismatch: { title: "عدم تطابق في أعداد الحمل", severity: "critical" },
  };
  const m = meta[kind];
  try {
    await NotificationService.emit({
      dedupeKey: `migration_load:${runId}:${kind}`,
      type: "migration_load",
      category: "migration",
      severity: m.severity,
      title: m.title,
      message,
      targetUrl: "/dashboard/production-migration",
      projectId: projectId ?? undefined,
      targetModule: "production-migration",
      targetRecordId: runId,
    });
  } catch {
    /* best-effort */
  }
}
