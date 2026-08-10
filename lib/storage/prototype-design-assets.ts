/**
 * NEXVORA Prototype Design Assets Storage
 * =======================================
 * Mirror of lib/storage/meeting-attachments.ts (private bucket, signed URLs).
 * Bucket must be created manually in Supabase — SQL provided in the final
 * report. Public reads are forbidden — always request a fresh signed URL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "prototype-design-assets";

/** Hard upload ceiling — visual references are usually PNG/JPG/PDF. */
export const HARD_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
/** Signed URL lifetime — matches meeting-attachments (600s). */
export const SIGNED_URL_TTL_SECONDS = 600;

const ALLOWED_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "pdf",
  "fig", "sketch", "xd", "psd",
]);

export function isAllowedDesignExt(ext: string): boolean {
  return ALLOWED_EXTS.has(ext.toLowerCase());
}

/**
 * Upload a design reference. Path shape:
 *   {projectId}/{configId}/{ts}-{shortId}.{ext}
 */
export async function uploadDesignAsset(
  supabase: SupabaseClient,
  projectId: string,
  configId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  ext: string,
): Promise<string> {
  const safeExt = (ext || mimeType.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!isAllowedDesignExt(safeExt)) {
    throw new Error(`صيغة غير مسموحة: ${safeExt}`);
  }
  if (fileBuffer.byteLength > HARD_MAX_UPLOAD_BYTES) {
    throw new Error(`حجم الملف يتجاوز الحد (${HARD_MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
  }
  const path = `${projectId}/${configId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`فشل رفع المرجع: ${error.message}`);
  return path;
}

export async function getDesignAssetSignedUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteDesignAsset(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`فشل حذف المرجع: ${error.message}`);
}
