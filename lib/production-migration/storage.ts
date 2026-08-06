import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * تخزين النسخ الاحتياطية ومخرَجات الترحيل — **رشيق**: يحاول الرفع إلى
 * bucket مخصّص، ويتدهور بأمان لو غاب (يرجّع null فيُخزَّن البيان في DB بدلًا
 * منه). لا وصول عام — روابط موقّعة فقط.
 */

const BUCKET = "migration-backups";

export async function uploadArtifact(supabase: SupabaseClient, key: string, json: string): Promise<{ path: string; size: number } | null> {
  try {
    const buffer = Buffer.from(json, "utf8");
    const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, { contentType: "application/json", upsert: true });
    if (error) return null;
    return { path: key, size: buffer.byteLength };
  } catch {
    return null;
  }
}

export async function downloadArtifact(supabase: SupabaseClient, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

export async function signedUrl(supabase: SupabaseClient, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, 300);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
