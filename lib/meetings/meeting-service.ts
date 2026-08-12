import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingStatus } from "@/lib/types/database";

/**
 * طبقة Meeting Management — كل عمليات CRUD الأساسية على meetings/projects
 * محصورة هنا. مفيش أي منطق AI ولا Telegram في الملف ده.
 */
export class MeetingService {
  static async findProjectByCode(
    supabase: SupabaseClient,
    code: string
  ): Promise<{ id: string; project_code: string } | null> {
    const { data } = await supabase
      .from("projects")
      .select("id, project_code")
      .eq("project_code", code)
      .maybeSingle();
    return data;
  }

  static async create(
    supabase: SupabaseClient,
    projectId: string,
    projectCode: string
  ): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from("meetings")
      .insert({ project_id: projectId, project_code: projectCode })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "فشل إنشاء الاجتماع");
    }
    return data;
  }

  static async updateStatus(
    supabase: SupabaseClient,
    meetingId: string,
    status: MeetingStatus
  ): Promise<void> {
    // مسح أي خطأ سابق عند الانتقال لحالة غير فاشلة (مثلاً عند إعادة المحاولة)
    const patch: Record<string, unknown> = { status };
    if (status !== "failed") {
      patch.error_code = null;
      patch.error_message = null;
    }
    await supabase.from("meetings").update(patch).eq("id", meetingId);
  }

  /** تعليم الاجتماع كفاشل مع تخزين السبب لعرضه في الواجهة. */
  static async markFailed(
    supabase: SupabaseClient,
    meetingId: string,
    code: string,
    message: string
  ): Promise<void> {
    await supabase
      .from("meetings")
      .update({ status: "failed", error_code: code, error_message: message })
      .eq("id", meetingId);
  }

  static async setRecordingUrl(
    supabase: SupabaseClient,
    meetingId: string,
    recordingUrl: string | null
  ): Promise<void> {
    await supabase.from("meetings").update({ recording_url: recordingUrl }).eq("id", meetingId);
  }

  static async saveTranscript(
    supabase: SupabaseClient,
    meetingId: string,
    rawText: string
  ): Promise<void> {
    await supabase.from("transcripts").insert({ meeting_id: meetingId, raw_text: rawText });
  }
}
