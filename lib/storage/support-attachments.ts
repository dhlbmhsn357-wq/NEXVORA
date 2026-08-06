import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "support-attachments";

export const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * طبقة File Processing لمرفقات محادثة الدعم (صور بس) — Bucket خاص،
 * الوصول دايمًا عبر Signed URL قصير الأجل، صفر رابط عام مباشر.
 * هيكل المجلدات: {widgetKey}/{timestamp}-{random}.{ext}
 */
export async function uploadSupportAttachment(
  supabase: SupabaseClient,
  widgetKey: string,
  fileBuffer: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const ext = mimeType.split("/")[1] ?? "bin";
  const path = `${widgetKey}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`فشل رفع المرفق: ${error.message}`);
  }

  return path;
}

export async function getSupportAttachmentUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) return null;
  return data.signedUrl;
}
