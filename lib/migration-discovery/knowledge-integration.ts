import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getLatestReport } from "./analysis-service";
import type { MigrationReportRow } from "./types";

/**
 * تكامل نتائج الاكتشاف مع طبقات المعرفة — **لا ترحيل، بناء معرفة**.
 *
 * بموافقة المدير، يُرقّى تحليل النظام القديم إلى **مرشّح خبرة مؤسسية**
 * (org_experience_candidates، الجزء X) — منظَّف من أي بيانات عميل، عام
 * وقابل لإعادة الاستخدام — لتستفيد منه المشاريع القادمة. يمرّ بنفس حاجز
 * المراجعة البشرية القائم (لا يدخل المكتبة مباشرة).
 */

const UNDEFINED_TABLE = "42P01";

/** يبني محتوى خبرة عامًا من التقرير — بلا أسماء عميل/مشروع/جداول حسّاسة. */
function buildReusableExperience(report: MigrationReportRow): { title: string; content: string; domain: string } {
  const domain = report.detected_domains[0] ?? "general";
  const detail = (report.detail ?? {}) as Record<string, unknown>;
  const complexity = String(detail.complexity ?? "unknown");
  const flows = Array.isArray(detail.businessFlows) ? (detail.businessFlows as Array<{ name: string }>).map((f) => f.name) : [];

  const title = `نمط ترحيل: ${report.system_type} (${domain})`;
  const content = [
    `عند ترحيل نظام من نوع «${report.system_type}» بمجال ${report.detected_domains.join("، ") || "عام"}:`,
    `- درجة الجاهزية النموذجية: ${report.readiness_score}/100، بتعقيد ${complexity}.`,
    flows.length > 0 ? `- تدفّقات الأعمال المتوقّعة: ${flows.join("، ")}.` : "",
    `- انتبه لمخاطر السلامة (المفاتيح الخارجية المكسورة والعلاقات الدائرية) قبل الترحيل.`,
    `- الجداول الحرجة (الأكثر ارتباطًا) تُرحَّل أولًا لضمان السلامة المرجعية.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { title, content, domain };
}

/**
 * يُرقّي أحدث تقرير لمصدر إلى مرشّح خبرة مؤسسية (قيد مراجعة المدير).
 * يعيد {ok, message}. رشيق لو جدول الذاكرة المؤسسية غير مطبَّق.
 */
export async function promoteAnalysisToOrgMemory(
  sourceId: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const report = (await getLatestReport(sourceId, db)) as MigrationReportRow | null;
  if (!report) return { ok: false, message: "لا يوجد تقرير لهذا المصدر بعد — شغّل التحليل أولًا." };

  const { title, content, domain } = buildReusableExperience(report);

  const { error } = await db.from("org_experience_candidates").insert({
    project_id: report.project_id,
    experience_type: "reusable_checklist",
    domain,
    title,
    content,
    detail: { source: "migration_discovery", system_type: report.system_type, readiness: report.readiness_score },
    sanitized: true,
    suggested_confidence: Math.min(80, 40 + Math.round(report.readiness_score / 3)),
    status: "pending",
  });

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "الذاكرة المؤسسية غير مطبَّقة بعد (ترحيل 0082)." };
    return { ok: false, message: error.message };
  }

  await db.from("migration_reports").update({ promoted_to_org_memory: true }).eq("id", report.id);
  return { ok: true, message: "تمت الترقية كمرشّح خبرة — راجعه في صفحة الذاكرة المؤسسية." };
}
