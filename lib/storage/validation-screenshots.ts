import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "validation-screenshots";

/**
 * طبقة تخزين لقطات شاشة Production Validation — Bucket خاص غير عام،
 * الوصول دايمًا عبر Signed URL قصير الأجل. نفس نمط lib/storage/discovery-uploads.ts
 * بالظبط. هيكل المجلدات: {projectId}/{sessionId}/{file}.
 */
export async function uploadValidationScreenshot(
  supabase: SupabaseClient,
  projectId: string,
  sessionId: string,
  buffer: Buffer
): Promise<string> {
  const path = `${projectId}/${sessionId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "image/png",
    upsert: false,
  });

  if (error) {
    throw new Error(`فشل رفع لقطة الشاشة: ${error.message}`);
  }

  return path;
}

export async function getValidationScreenshotUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) return null;
  return data.signedUrl;
}
