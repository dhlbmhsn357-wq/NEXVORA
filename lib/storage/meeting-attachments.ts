import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingAttachmentFileType } from "@/lib/types/database";

const BUCKET = "meeting-attachments";

/** سقف صلب — نفس فلسفة discovery-uploads.ts. */
export const HARD_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

const EXT_TO_TYPE: Record<string, MeetingAttachmentFileType> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  pdf: "pdf",
  docx: "docx", doc: "docx",
  xlsx: "xlsx", xls: "xlsx",
  csv: "csv",
};

export function detectAttachmentFileType(ext: string): MeetingAttachmentFileType {
  return EXT_TO_TYPE[ext.toLowerCase()] ?? "other";
}

/**
 * تخزين مرفقات الاجتماعات — نفس فلسفة discovery-uploads.ts (Bucket
 * خاص، وصول عبر Signed URL بس)، لكن عام لأي عدد مرفقات لكل اجتماع
 * بدل مسار ثابت واحد (زي meeting-storage.ts القديمة اللي بتخزّن
 * التسجيل الصوتي بس).
 */
export async function uploadMeetingAttachment(
  supabase: SupabaseClient,
  projectId: string,
  meetingIdOrPrepId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  ext: string
): Promise<string> {
  const safeExt = (ext || mimeType.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const path = `${projectId}/${meetingIdOrPrepId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`فشل رفع المرفق: ${error.message}`);
  }

  return path;
}

export async function getMeetingAttachmentUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) return null;
  return data.signedUrl;
}
