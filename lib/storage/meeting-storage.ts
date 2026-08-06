import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "meetings";

/**
 * طبقة File Processing — رفع/تنزيل ملفات الاجتماعات في Supabase Storage
 * محصور هنا بس. هيكل المجلدات: meetings/{project_code}/{meeting_id}/recording
 */
/** مسار تسجيل الاجتماع القياسي — مصدر واحد للحقيقة للرفع والتنزيل. */
export function meetingRecordingPath(projectCode: string, meetingId: string): string {
  return `${projectCode}/${meetingId}/recording`;
}

/** اسم الـ Bucket — يُستخدم من المتصفح وقت الرفع المباشر. */
export const MEETINGS_BUCKET = BUCKET;

/**
 * تنزيل تسجيل اجتماع من Storage كـ ArrayBuffer — للتفريغ لما يكون الملف
 * مرفوعًا أصلًا (تسجيل داخل المنصة بيترفع من المتصفح مباشرة).
 */
export async function downloadMeetingRecording(
  supabase: SupabaseClient,
  path: string
): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`فشل تنزيل التسجيل من Storage: ${error?.message ?? "الملف غير موجود"}`);
  }
  return data.arrayBuffer();
}

export async function uploadMeetingRecording(
  supabase: SupabaseClient,
  projectCode: string,
  meetingId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const path = meetingRecordingPath(projectCode, meetingId);

  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`فشل رفع التسجيل إلى Storage: ${error.message}`);
  }

  return path;
}
