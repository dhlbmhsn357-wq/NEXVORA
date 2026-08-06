import { createServiceClient } from "@/lib/supabase/service";
import { ProductionMonitoringEngine } from "./generation-service";

/**
 * مسح يومي لكل المشاريع اللي عندها رابط Production أو Staging مُعرَّف —
 * بيتنادى من app/api/cron/production-monitoring/route.ts (Vercel Cron
 * مرة يوميًا، سقف خطة Hobby الحقيقي — راجع التقرير الختامي).
 *
 * قيد معروف للتوسع المستقبلي: المسح ده تسلسلي (مشروع بعد التاني) داخل
 * نفس الطلب — مناسب لعدد محدود من المشاريع الآن، لكن مع آلاف المشاريع
 * مستقبلًا محتاج تحويله لـ Queue حقيقي (كل مشروع Job منفصل) بدل حلقة
 * واحدة قد تتخطى سقف وقت تنفيذ الدالة (maxDuration).
 */
export async function sweepAllProjects(): Promise<{ checked: number; skipped: number; failed: number }> {
  const supabase = createServiceClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, production_url, staging_url")
    .is("archived_at", null);

  let checked = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of projects ?? []) {
    const targetUrl = project.production_url?.trim() || project.staging_url?.trim();
    if (!targetUrl) {
      skipped++;
      continue;
    }

    const result = await ProductionMonitoringEngine.runCheck(project.id, "cron");
    if (result.status !== "started") {
      skipped++;
      continue;
    }

    try {
      await ProductionMonitoringEngine.runCheckCore(result.checkId);
      checked++;
    } catch (err) {
      console.error(`[ProductionMonitoring sweep] failed for project ${project.id}:`, err);
      failed++;
    }
  }

  return { checked, skipped, failed };
}
