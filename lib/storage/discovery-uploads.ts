import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "discovery-uploads";

/** سقف صلب على مستوى الخادم مهما كانت إعدادات السؤال. */
export const HARD_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * طبقة تخزين ملفات الاكتشاف — Bucket خاص غير عام، الوصول دايمًا عبر
 * Signed URL قصير الأجل. هيكل المجلدات: {projectId}/{questionId}/{file}.
 */
export async function uploadDiscoveryFile(
  supabase: SupabaseClient,
  projectId: string,
  questionId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  ext: string
): Promise<string> {
  const safeExt = (ext || mimeType.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const path = `${projectId}/${questionId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`فشل رفع الملف: ${error.message}`);
  }

  return path;
}

export async function getDiscoveryFileUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) return null;
  return data.signedUrl;
}
