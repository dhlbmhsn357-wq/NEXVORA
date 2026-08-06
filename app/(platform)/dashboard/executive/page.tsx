import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import {
  computeAndStoreSnapshot,
  refreshExecutiveAlerts,
  getMetricHistory,
  listExecutiveReports,
  listExecutiveInsights,
} from "@/lib/executive/service";
import ExecutiveClient from "./executive-client";

export const dynamic = "force-dynamic";

/**
 * غرفة القيادة التنفيذية (المرحلة السابعة) — العقل التنفيذي (COO).
 * تحسب لقطة صحة حيّة عبر كل الشركة عند كل تحميل (وتخزّنها للاتجاه)،
 * وتحدّث التنبيهات التنفيذية، وتعرض المساعد التنفيذي والتقارير.
 * محصورة لـ owner/admin.
 */
export default async function ExecutivePage() {
  const auth = await requireRole(["owner", "admin"]);
  if (!auth.ok) redirect("/dashboard");

  const snapshot = await computeAndStoreSnapshot();
  await refreshExecutiveAlerts(snapshot);
  const [history, reports, insights] = await Promise.all([
    getMetricHistory(30),
    listExecutiveReports(10),
    listExecutiveInsights(10),
  ]);

  return (
    <ExecutiveClient
      snapshot={{
        health: snapshot.health,
        kpis: snapshot.kpis,
        greenProjects: snapshot.greenProjects,
        yellowProjects: snapshot.yellowProjects,
        redProjects: snapshot.redProjects,
      }}
      history={history}
      reports={reports}
      insights={insights}
    />
  );
}
