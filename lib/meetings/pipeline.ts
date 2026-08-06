import { createServiceClient } from "@/lib/supabase/service";
import { TelegramClient } from "@/lib/telegram/client";
import { MeetingService } from "./meeting-service";
import { uploadMeetingRecording, downloadMeetingRecording } from "@/lib/storage/meeting-storage";
import { TranscriptionAgent } from "@/lib/ai/agents/transcription-agent";
import { MeetingExtractionAgent } from "@/lib/ai/agents/meeting-extraction-agent";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { saveExtractionToBrain } from "./brain-integration";
import { ProjectBrainSyncService } from "@/lib/brain/sync-service";
import { mergeMeetingIntoBrain } from "@/lib/brain-v2/meeting-integration";
import { writeLifecycleEvent } from "@/lib/meeting-presentation/live-session-service";
import { maybeGenerateMeetingReview } from "@/lib/meeting-presentation/meeting-review-service";
import { MeetingExtractionV2Agent } from "@/lib/ai/agents/meeting-extraction-v2-agent";
import { saveExtractionV2ToNormalizedTables } from "./extraction-v2-persistence";

/**
 * مصدر الصوت للمعالجة — إما تنزيل من Telegram (المسار القديم) أو ملف
 * مرفوع أصلًا في Storage (التسجيل داخل المنصة). النواة واحدة للاتنين.
 */
export type MeetingAudioSource =
  | { kind: "telegram"; fileId: string; botToken: string; chatId: number }
  | { kind: "storage"; storagePath: string };

/**
 * خط معالجة الاجتماع الكامل: Upload → Transcription → Extraction →
 * Save → Complete. كل خطوة بتحدّث حالة الاجتماع بالترتيب المحدد فقط،
 * وأي فشل بيوقف الـ Pipeline على "failed" فورًا بدون قفز حالات.
 *
 * بيتنفذ في الخلفية (عبر after()) — سواء بعد الرد السريع على Telegram
 * أو بعد ما المستخدم ينهي اجتماعًا مسجّلًا داخل المنصة.
 */
export async function processMeetingPipeline(params: {
  meetingId: string;
  projectId: string;
  projectCode: string;
  mimeType: string;
  source: MeetingAudioSource;
}): Promise<void> {
  const supabase = createServiceClient();

  // إشعار المستخدم عبر Telegram متاح فقط لو الصوت جه من Telegram أصلًا.
  // في تسجيل المنصة الحالة بتتعرض في الواجهة نفسها (polling) — مفيش قناة
  // خارجية، فالإشعار بيبقى no-op بدل ما نكرر الـ Pipeline كله.
  const telegram = params.source.kind === "telegram" ? new TelegramClient(params.source.botToken) : null;
  const chatId = params.source.kind === "telegram" ? params.source.chatId : null;
  const notify = async (message: string) => {
    if (telegram && chatId !== null) await telegram.sendMessage(chatId, message);
  };

  try {
    await MeetingService.updateStatus(supabase, params.meetingId, "transcribing");

    let audioBuffer: ArrayBuffer;
    if (params.source.kind === "telegram") {
      audioBuffer = await telegram!.downloadFile(params.source.fileId);

      const storagePath = await uploadMeetingRecording(
        supabase,
        params.projectCode,
        params.meetingId,
        audioBuffer,
        params.mimeType
      );
      await MeetingService.setRecordingUrl(supabase, params.meetingId, storagePath);
    } else {
      // التسجيل مرفوع أصلًا من المتصفح مباشرة لـ Storage — ننزّله للتفريغ بس.
      audioBuffer = await downloadMeetingRecording(supabase, params.source.storagePath);
      await MeetingService.setRecordingUrl(supabase, params.meetingId, params.source.storagePath);
    }

    const transcription = await TranscriptionAgent.run(audioBuffer, params.mimeType, {
      projectId: params.projectId,
      meetingId: params.meetingId,
    });

    if (transcription.status === "error") {
      const msg = friendlyAiErrorMessage(transcription.code, transcription.message);
      await MeetingService.markFailed(supabase, params.meetingId, transcription.code, msg);
      await notify(`فشل تفريغ التسجيل: ${msg}`);
      return;
    }

    await MeetingService.saveTranscript(supabase, params.meetingId, transcription.text);
    await MeetingService.updateStatus(supabase, params.meetingId, "transcribed");
    await writeLifecycleEvent(supabase, params.projectId, params.meetingId, "transcript_uploaded", null, null);

    await MeetingService.updateStatus(supabase, params.meetingId, "extracting");

    const extraction = await MeetingExtractionAgent.run(transcription.text, {
      projectId: params.projectId,
      meetingId: params.meetingId,
    });

    if (extraction.status === "error") {
      const msg = friendlyAiErrorMessage(extraction.code, extraction.message);
      await MeetingService.markFailed(supabase, params.meetingId, extraction.code, msg);
      await notify(`تم تفريغ التسجيل لكن فشل استخراج البيانات: ${msg}`);
      return;
    }

    await saveExtractionToBrain(supabase, params.projectId, params.meetingId, extraction.data);

    // الاستخراج الغني (Phase 2 — Meeting Intelligence): نداء AI إضافي
    // منفصل تمامًا عن المسار القديم فوق، بيكتب في الجداول المُطبّعة
    // الجديدة (قرارات/متطلبات/مخاطر/أسئلة/مهام/عناصر عامة) بدل الاكتفاء
    // بـ jsonb blob. فشله لا يوقف الـ Pipeline — المسار القديم (Brain
    // v1/v2 + Meeting Review) شغّال بالكامل بمعزل عنه.
    try {
      const extractionV2 = await MeetingExtractionV2Agent.run(transcription.text, {
        projectId: params.projectId,
        meetingId: params.meetingId,
      });
      if (extractionV2.status === "success") {
        await saveExtractionV2ToNormalizedTables(supabase, params.projectId, params.meetingId, extractionV2.data);
      } else {
        console.error(`[MeetingPipeline] V2 extraction failed for meeting ${params.meetingId}: ${extractionV2.message}`);
      }
    } catch (err) {
      console.error(`[MeetingPipeline] V2 extraction threw for meeting ${params.meetingId}:`, err);
    }

    await MeetingService.updateStatus(supabase, params.meetingId, "processed");
    await notify("تم تجهيز الاجتماع بنجاح ✅ راجع Project Brain.");

    const syncResult = await ProjectBrainSyncService.sync(params.projectId, "meeting_processed");
    if (syncResult.status === "error") {
      console.error(
        `[MeetingPipeline] Project Brain sync failed after meeting ${params.meetingId}: ${syncResult.message}`
      );
    }

    try {
      const mergeResult = await mergeMeetingIntoBrain(
        supabase,
        params.projectId,
        params.meetingId,
        extraction.data,
        null
      );
      if (!mergeResult.ok) {
        console.error(
          `[MeetingPipeline] Brain v2 merge failed for meeting ${params.meetingId}: ${mergeResult.message}`
        );
      }
      // ملحوظة معمارية (Phase 3 Enhancement): mergeMeetingIntoBrain بقى
      // بيقترح Pending Changes بس، مش بيعدّل Brain مباشرة — فـ
      // notifyBrainChanged مبقاش يتنادى هنا؛ بيتنادى تلقائيًا جوّه
      // acceptPendingChange وقت ما PM يعتمد أي تغيير فعليًا (راجع
      // lib/brain-v2/pending-changes-service.ts).
    } catch (err) {
      console.error(`[MeetingPipeline] Brain v2 merge threw for meeting ${params.meetingId}:`, err);
    }

    // لو الاجتماع ده جه من Meeting Presentation (فيه عرض تقديمي مرتبط)،
    // نولّد Meeting Review (مقارنة الخطة بالنص الفعلي) — بيتجاهل بهدوء
    // لأي اجتماع عادي مفيهوش عرض تقديمي (رفع مباشر بدون خطة).
    try {
      await maybeGenerateMeetingReview(params.projectId, params.meetingId, extraction.data, null);
    } catch (err) {
      console.error(`[MeetingPipeline] maybeGenerateMeetingReview threw for meeting ${params.meetingId}:`, err);
    }
  } catch (err) {
    console.error(`[MeetingPipeline] Unexpected failure for meeting ${params.meetingId}:`, err);
    const msg = err instanceof Error ? err.message : "خطأ غير متوقع أثناء المعالجة.";
    await MeetingService.markFailed(supabase, params.meetingId, "UNEXPECTED", msg);
    await notify("حصل خطأ غير متوقع أثناء معالجة الاجتماع.");
  }
}
