import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * تكامل قواعد التحويل المعتمَدة مع الذاكرة المؤسسية.
 *
 * بعد اعتماد Pipeline، تُحفَظ قواعده في مكتبة القواعد + تُرقَّى كمرشّح خبرة
 * مؤسسية (حاجز مراجعة المدير). فتُقترَح تلقائيًا في مشاريع المجال المشابهة.
 */

const UNDEFINED_TABLE = "42P01";

export async function promotePipelineToOrgMemory(pipelineId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const pipe = await db.from("transformation_pipelines").select("id, status, domain, confidence_avg, coverage, project_id").eq("id", pipelineId).maybeSingle();
  if (!pipe.data) return { ok: false, message: "الـPipeline غير موجود." };
  const p = pipe.data as { status: string; domain: string; confidence_avg: number; coverage: number; project_id: string | null };
  if (p.status !== "approved") return { ok: false, message: "اعتمد المحرّك أولًا قبل الترقية." };

  // 1) قواعد المكتبة القابلة لإعادة الاستخدام.
  const approved = await db.from("transformation_rules").select("kind, target_field").eq("pipeline_id", pipelineId).eq("status", "approved");
  const rules = (approved.data ?? []) as Array<{ kind: string; target_field: string }>;
  for (const r of rules.slice(0, 100)) {
    try {
      await db.from("transformation_rule_library").insert({
        rule_key: `${p.domain}_${r.kind}_${r.target_field}`.slice(0, 120),
        domain: p.domain,
        kind: r.kind,
        title: `${r.kind} → ${r.target_field}`,
        definition: {},
        source_project_ids: p.project_id ? [p.project_id] : [],
        approved: true,
        created_by: actorId,
      });
    } catch {
      /* مفتاح مكرّر أو جدول غير مطبَّق */
    }
  }

  // 2) مرشّح خبرة مؤسسية.
  const { error } = await db.from("org_experience_candidates").insert({
    project_id: p.project_id,
    experience_type: "reusable_workflow",
    domain: p.domain || "generic",
    title: `محرّك تحويل معتمَد (${p.domain || "عام"})`,
    content: `Pipeline تحويل معتمَد لمجال «${p.domain || "عام"}»:\n- ${rules.length} قاعدة تحويل معتمَدة، تغطية ${p.coverage}٪، متوسّط ثقة ${p.confidence_avg}٪.\n- أعد استخدام هذه القواعد للأنظمة المشابهة لتسريع بناء المحرّك.`,
    detail: { source: "transformation_engine", rules: rules.length, coverage: p.coverage },
    sanitized: true,
    suggested_confidence: Math.min(85, p.confidence_avg),
    status: "pending",
  });
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "الذاكرة المؤسسية غير مطبَّقة (0082)." };
    return { ok: false, message: error.message };
  }

  await db.from("transformation_pipelines").update({ promoted_to_org_memory: true }).eq("id", pipelineId);
  return { ok: true, message: "تمت الترقية — قواعد قابلة لإعادة الاستخدام + مرشّح خبرة ينتظر مراجعة المدير." };
}
