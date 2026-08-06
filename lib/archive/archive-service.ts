import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * طبقة Soft Delete/Archive الموحّدة. كل الكيانات القابلة للأرشفة عندها
 * عمود archived_at (nullable). الأرشفة = ضبط الطابع الزمني؛ إلغاء
 * الأرشفة = ضبطه null. الاستعلامات الافتراضية في الواجهة بتفلتر
 * archived_at IS NULL، فالكيان بيختفي بدون ما ينحذف فعليًا.
 */

export type ArchivableTable = "leads" | "projects" | "meetings";

export async function archiveEntity(
  supabase: SupabaseClient,
  table: ArchivableTable,
  id: string
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function unarchiveEntity(
  supabase: SupabaseClient,
  table: ArchivableTable,
  id: string
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from(table).update({ archived_at: null }).eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
