import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * تكامل الـMapping المعتمَد مع الذاكرة المؤسسية.
 *
 * بعد اعتماد مخطّط، يُرقَّى كـ**قالب Mapping قابل لإعادة الاستخدام** +
 * مرشّح خبرة مؤسسية (بموافقة المدير، عبر حاجز المراجعة القائم). فإذا تكرّر
 * نفس نوع النظام مستقبلًا، يُقترَح القالب تلقائيًا.
 */

const UNDEFINED_TABLE = "42P01";

export async function promoteBlueprintToOrgMemory(
  blueprintId: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();

  const bp = await db.from("migration_blueprints").select("*").eq("id", blueprintId).maybeSingle();
  if (!bp.data) return { ok: false, message: "المخطّط غير موجود." };
  const blueprint = bp.data as { id: string; status: string; detected_template: string | null; complexity: string; confidence_avg: number; project_id: string | null; stats: Record<string, unknown> };
  if (blueprint.status !== "approved") return { ok: false, message: "اعتمد المخطّط أولًا قبل ترقيته." };

  const entities = await db.from("migration_entity_mappings").select("canonical_entity, old_objects").eq("blueprint_id", blueprintId).eq("status", "approved");
  const entityList = ((entities.data ?? []) as Array<{ canonical_entity: string }>).map((e) => e.canonical_entity);

  // 1) حفظ قالب قابل لإعادة الاستخدام.
  const templateKey = `${blueprint.detected_template ?? "custom"}_${blueprintId.slice(0, 8)}`;
  try {
    await db.from("migration_mapping_templates").insert({
      template_key: templateKey,
      label: `قالب Mapping: ${blueprint.detected_template ?? "نظام مخصّص"}`,
      domain: "generic",
      mapping: { entities: entityList, stats: blueprint.stats },
      source_project_ids: blueprint.project_id ? [blueprint.project_id] : [],
      created_by: actorId,
    });
  } catch {
    /* قد يكون الجدول غير مطبَّق أو المفتاح مكرّرًا */
  }

  // 2) مرشّح خبرة مؤسسية (حاجز مراجعة المدير القائم).
  const { error } = await db.from("org_experience_candidates").insert({
    project_id: blueprint.project_id,
    experience_type: "reusable_checklist",
    domain: "generic",
    title: `قالب Mapping معتمَد: ${blueprint.detected_template ?? "نظام مخصّص"}`,
    content: `مخطّط Mapping معتمَد يربط نظامًا من نوع «${blueprint.detected_template ?? "مخصّص"}» بالنموذج القياسي.\n- الكيانات: ${entityList.join("، ") || "—"}.\n- متوسّط الثقة: ${blueprint.confidence_avg}%، التعقيد: ${blueprint.complexity}.\n- أعد استخدام هذا القالب للأنظمة المشابهة لتسريع المراجعة.`,
    detail: { source: "schema_mapping", template_key: templateKey },
    sanitized: true,
    suggested_confidence: Math.min(85, blueprint.confidence_avg),
    status: "pending",
  });
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "الذاكرة المؤسسية غير مطبَّقة (0082)." };
    return { ok: false, message: error.message };
  }

  await db.from("migration_blueprints").update({ promoted_to_org_memory: true }).eq("id", blueprintId);
  return { ok: true, message: "تمت الترقية — قالب قابل لإعادة الاستخدام + مرشّح خبرة ينتظر مراجعة المدير." };
}
