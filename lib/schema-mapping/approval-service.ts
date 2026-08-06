import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * سير اعتماد الـMapping — approve/reject/edit للمطابقات، واعتماد المخطّط
 * كاملًا مع كتابة إصدار للتاريخ والتراجع. القرار للمدير/الإداري.
 */

export type MappingKind = "entity" | "field";

function table(kind: MappingKind): string {
  return kind === "entity" ? "migration_entity_mappings" : "migration_field_mappings";
}

export async function decideMapping(
  kind: MappingKind,
  id: string,
  decision: "approved" | "rejected",
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from(table(kind)).update({ status: decision, decided_by: actorId, decided_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** تعديل يدوي لتطابق حقل (استبدال/تقسيم/دمج): new_field + kind. */
export async function editFieldMapping(
  id: string,
  patch: { newField?: string | null; newFieldLabel?: string | null; kind?: string },
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const update: Record<string, unknown> = { status: "approved", decided_by: actorId, decided_at: new Date().toISOString() };
  if (patch.newField !== undefined) update.new_field = patch.newField;
  if (patch.newFieldLabel !== undefined) update.new_field_label = patch.newFieldLabel;
  if (patch.kind !== undefined) update.kind = patch.kind;
  const { error } = await db.from("migration_field_mappings").update(update).eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** اعتماد المخطّط كاملًا — يشترط ألا تبقى مطابقات pending حرجة. */
export async function approveBlueprint(
  blueprintId: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();

  const pendingFields = await db.from("migration_field_mappings").select("id", { count: "exact", head: true }).eq("blueprint_id", blueprintId).eq("status", "pending").not("new_field", "is", null);
  if ((pendingFields.count ?? 0) > 0) {
    return { ok: false, message: `يتبقّى ${pendingFields.count} تطابق حقل قيد المراجعة — اعتمدها أو ارفضها أولًا.` };
  }

  const bp = await db.from("migration_blueprints").select("version").eq("id", blueprintId).maybeSingle();
  const version = (bp.data as { version: number } | null)?.version ?? 1;

  const { error } = await db.from("migration_blueprints").update({ status: "approved" }).eq("id", blueprintId);
  if (error) return { ok: false, message: error.message };

  await db.from("migration_blueprint_versions").insert({ blueprint_id: blueprintId, version, action: "approved", actor_id: actorId });
  return { ok: true, message: "اعتُمد المخطّط — أصبح المرجع الرسمي لمراحل الترحيل التالية." };
}

/** تاريخ إصدارات المخطّط. */
export async function getBlueprintHistory(blueprintId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const { data } = await db.from("migration_blueprint_versions").select("*").eq("blueprint_id", blueprintId).order("created_at", { ascending: false });
  return data ?? [];
}
