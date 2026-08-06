"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadMeetingAttachment, getMeetingAttachmentUrl, HARD_MAX_UPLOAD_BYTES } from "@/lib/storage/meeting-attachments";
import { detectFileTypeFromExt, analyzeMeetingAttachment } from "@/lib/meetings/attachment-analysis-service";
import type { MeetingAttachment } from "@/lib/types/database";

type UploadResult = { ok: true; attachment: MeetingAttachment } | { ok: false; message: string };

/** رفع مرفق اجتماع + تحليله بالذكاء الاصطناعي في الخلفية (after()). */
export async function uploadMeetingAttachmentAction(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const projectId = formData.get("projectId");
  const meetingId = formData.get("meetingId");
  const meetingPreparationId = formData.get("meetingPreparationId");
  const title = formData.get("title");
  const description = formData.get("description");
  const file = formData.get("file");

  if (typeof projectId !== "string" || !(file instanceof File)) {
    return { ok: false, message: "بيانات غير مكتملة." };
  }
  if (file.size > HARD_MAX_UPLOAD_BYTES) {
    return { ok: false, message: `حجم الملف أكبر من الحد المسموح (${Math.round(HARD_MAX_UPLOAD_BYTES / (1024 * 1024))} ميجا).` };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const fileType = detectFileTypeFromExt(ext);
  const folderId = typeof meetingId === "string" && meetingId ? meetingId : typeof meetingPreparationId === "string" ? meetingPreparationId : projectId;

  try {
    const buffer = await file.arrayBuffer();
    const storagePath = await uploadMeetingAttachment(supabase, projectId, folderId, buffer, file.type, ext);

    const { data: inserted, error } = await supabase
      .from("meeting_attachments")
      .insert({
        meeting_id: typeof meetingId === "string" && meetingId ? meetingId : null,
        meeting_preparation_id: typeof meetingPreparationId === "string" && meetingPreparationId ? meetingPreparationId : null,
        project_id: projectId,
        title: typeof title === "string" && title.trim() ? title.trim() : file.name,
        description: typeof description === "string" ? description.trim() : "",
        file_type: fileType,
        storage_path: storagePath,
        file_size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return { ok: false, message: `فشل حفظ بيانات المرفق: ${error?.message ?? "سبب غير معروف"}` };
    }

    const attachment = inserted as MeetingAttachment;
    after(async () => {
      await analyzeMeetingAttachment(createServiceClient(), attachment.id);
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, attachment };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل رفع المرفق." };
  }
}

export async function getMeetingAttachmentUrlAction(path: string): Promise<{ ok: true; url: string } | { ok: false }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const url = await getMeetingAttachmentUrl(supabase, path);
  return url ? { ok: true, url } : { ok: false };
}
