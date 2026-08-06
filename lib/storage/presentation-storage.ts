import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "client-presentations";

/**
 * طبقة File Processing لملفات PPTX — رفعها وتوليد رابط تنزيل مؤقت
 * (Signed URL) بس، بدون أي وصول عام مباشر للـ Bucket.
 */
export async function uploadPresentationPptx(
  supabase: SupabaseClient,
  projectId: string,
  version: number,
  buffer: Buffer
): Promise<string> {
  const path = `${projectId}/v${version}.pptx`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    upsert: true,
  });

  if (error) {
    throw new Error(`فشل رفع ملف PPTX: ${error.message}`);
  }

  return path;
}

export async function getPresentationDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 300);

  if (error || !data) return null;
  return data.signedUrl;
}
