import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * تكامل قواعد التنظيف المعتمَدة مع الذاكرة المؤسسية.
 *
 * بعد اعتماد تشغيلة، تُرقَّى قواعد الجودة كمرشّح خبرة مؤسسية (حاجز مراجعة
 * المدير القائم). فإذا تكرّر نفس الخطأ مستقبلًا، يُقترَح الحل تلقائيًا.
 */

const UNDEFINED_TABLE = "42P01";

export async function promoteRulesToOrgMemory(runId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const run = await db.from("data_quality_runs").select("id, domain, quality_score, project_id, report").eq("id", runId).maybeSingle();
  if (!run.data) return { ok: false, message: "التشغيلة غير موجودة." };
  const r = run.data as { domain: string; quality_score: number; project_id: string | null; report: Record<string, unknown> };
  const ruleCounts = (r.report?.ruleCounts ?? {}) as Record<string, number>;
  const total = Object.values(ruleCounts).reduce((s, n) => s + Number(n), 0);

  const { error } = await db.from("org_experience_candidates").insert({
    project_id: r.project_id,
    experience_type: "reusable_checklist",
    domain: r.domain || "generic",
    title: `قواعد تنظيف بيانات معتمَدة (${r.domain || "عام"})`,
    content: `مجموعة قواعد جودة بيانات مُثبَتة لمجال «${r.domain || "عام"}»:\n- ${total} قاعدة (تحقّق/توحيد/عمل/تنظيف).\n- رفعت جودة البيانات إلى ${r.quality_score}% قبل الترحيل.\n- أعد استخدامها للأنظمة المشابهة: اكتشاف تكرار دلالي/صوتي، تطبيع الهواتف والدول، فحص السلامة المرجعية.`,
    detail: { source: "data_quality", rule_counts: ruleCounts, quality_score: r.quality_score },
    sanitized: true,
    suggested_confidence: Math.min(85, 50 + Math.round(r.quality_score / 4)),
    status: "pending",
  });
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "الذاكرة المؤسسية غير مطبَّقة (0082)." };
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "تمت الترقية — قواعد التنظيف تنتظر مراجعة المدير في الذاكرة المؤسسية." };
}
