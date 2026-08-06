import { createServiceClient } from "@/lib/supabase/service";
import { TranscriptionAgent } from "@/lib/ai/agents/transcription-agent";
import { MeetingExtractionAgent } from "@/lib/ai/agents/meeting-extraction-agent";
import { MeetingService } from "./meeting-service";
import { saveExtractionToBrain } from "./brain-integration";
import { ProjectBrainSyncService } from "@/lib/brain/sync-service";
import { mergeMeetingIntoBrain } from "@/lib/brain-v2/meeting-integration";
import type { Meeting } from "@/lib/types/database";

/**
 * فشل اقتراح التغييرات في Brain v2 ما يمنعش نجاح معالجة الاجتماع نفسه.
 * mergeMeetingIntoBrain بقى بيقترح Pending Changes بس (Phase 3
 * Enhancement) — مفيش تعديل مباشر لـ Brain هنا، فمفيش داعي لـ
 * notifyBrainChanged؛ ده بيتنادى تلقائيًا وقت اعتماد PM لأي تغيير فعليًا.
 */
async function mergeMeetingIntoBrainSafely(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  meetingId: string,
  extraction: Parameters<typeof mergeMeetingIntoBrain>[3]
): Promise<void> {
  try {
    const result = await mergeMeetingIntoBrain(supabase, projectId, meetingId, extraction, null);
    if (!result.ok) {
      console.error(`[MeetingRetry] Brain v2 merge failed for meeting ${meetingId}: ${result.message}`);
    }
  } catch (err) {
    console.error(`[MeetingRetry] Brain v2 merge threw for meeting ${meetingId}:`, err);
  }
}

/**
 * إعادة تشغيل مرحلة معالجة اجتماع فاشل من الحالة الأخيرة الناجحة —
 * بدون إعادة رفع الملف. بيقرأ التسجيل الموجود من Storage عبر URL،
 * ويحدد من فين يبدأ بناءً على الحالة الحالية (transcribing / extracting).
 *
 * لو مفيش recording_url أو مفيش transcript محفوظ، بيرجّع خطأ واضح
 * ويبقى على المستخدم يرفع الملف من جديد عبر Telegram.
 */
export class MeetingRetryService {
  static async retry(meetingId: string): Promise<{ ok: boolean; message?: string }> {
    const supabase = createServiceClient();

    const { data: meeting } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .maybeSingle();

    if (!meeting) return { ok: false, message: "الاجتماع غير موجود." };
    const m = meeting as Meeting;

    if (m.status !== "failed") {
      return { ok: false, message: "الاجتماع مش في حالة فشل — مفيش داعي لإعادة المحاولة." };
    }

    if (!m.recording_url) {
      return {
        ok: false,
        message: "مفيش تسجيل محفوظ لهذا الاجتماع — لازم ترفعه من جديد عبر Telegram.",
      };
    }

    try {
      // فحص هل عندنا transcript محفوظ فعلاً؟ لو أيوه، نبدأ من extraction.
      const { data: transcriptRow } = await supabase
        .from("transcripts")
        .select("raw_text")
        .eq("meeting_id", meetingId)
        .maybeSingle();

      if (transcriptRow?.raw_text) {
        // Retry من مرحلة الاستخراج فقط
        await MeetingService.updateStatus(supabase, meetingId, "extracting");
        const extraction = await MeetingExtractionAgent.run(transcriptRow.raw_text, {
          projectId: m.project_id,
          meetingId,
        });

        if (extraction.status === "error") {
          await MeetingService.updateStatus(supabase, meetingId, "failed");
          return { ok: false, message: "فشل استخراج البيانات — جرّب مرة تانية بعد شوية." };
        }

        await saveExtractionToBrain(supabase, m.project_id, meetingId, extraction.data);
        await MeetingService.updateStatus(supabase, meetingId, "processed");
        await ProjectBrainSyncService.sync(m.project_id, "meeting_processed");
        await mergeMeetingIntoBrainSafely(supabase, m.project_id, meetingId, extraction.data);
        return { ok: true };
      }

      // مفيش transcript — نحاول نجيب الملف من Storage ونعيد التفريغ + الاستخراج
      const { data: signed } = await supabase.storage
        .from("meetings")
        .createSignedUrl(m.recording_url, 300);

      if (!signed?.signedUrl) {
        await MeetingService.updateStatus(supabase, meetingId, "failed");
        return { ok: false, message: "تعذّر الوصول للتسجيل المحفوظ — ارفعه من جديد عبر Telegram." };
      }

      const audioRes = await fetch(signed.signedUrl);
      if (!audioRes.ok) {
        await MeetingService.updateStatus(supabase, meetingId, "failed");
        return { ok: false, message: "تعذّر تحميل التسجيل من Storage." };
      }
      const audioBuffer = await audioRes.arrayBuffer();
      const mimeType = audioRes.headers.get("content-type") ?? "audio/ogg";

      await MeetingService.updateStatus(supabase, meetingId, "transcribing");
      const transcription = await TranscriptionAgent.run(audioBuffer, mimeType, {
        projectId: m.project_id,
        meetingId,
      });

      if (transcription.status === "error") {
        await MeetingService.updateStatus(supabase, meetingId, "failed");
        return { ok: false, message: "فشل تفريغ التسجيل مرة تانية." };
      }

      await MeetingService.saveTranscript(supabase, meetingId, transcription.text);
      await MeetingService.updateStatus(supabase, meetingId, "extracting");

      const extraction = await MeetingExtractionAgent.run(transcription.text, {
        projectId: m.project_id,
        meetingId,
      });

      if (extraction.status === "error") {
        await MeetingService.updateStatus(supabase, meetingId, "failed");
        return { ok: false, message: "فشل استخراج البيانات بعد التفريغ الناجح." };
      }

      await saveExtractionToBrain(supabase, m.project_id, meetingId, extraction.data);
      await MeetingService.updateStatus(supabase, meetingId, "processed");
      await ProjectBrainSyncService.sync(m.project_id, "meeting_processed");
      await mergeMeetingIntoBrainSafely(supabase, m.project_id, meetingId, extraction.data);

      return { ok: true };
    } catch (err) {
      console.error(`[MeetingRetry] Unexpected failure for meeting ${meetingId}:`, err);
      await MeetingService.updateStatus(supabase, meetingId, "failed");
      return { ok: false, message: err instanceof Error ? err.message : "خطأ غير متوقع." };
    }
  }
}
