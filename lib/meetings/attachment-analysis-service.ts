import type { SupabaseClient } from "@supabase/supabase-js";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildMeetingFileAnalysisPrompt } from "@/lib/ai/prompts/meeting-file-analysis";
import { validateMeetingFileAnalysis } from "@/lib/ai/validation/meeting-file-analysis";
import { detectAttachmentFileType } from "@/lib/storage/meeting-attachments";
import type { MeetingAttachment } from "@/lib/types/database";

const BUCKET = "meeting-attachments";
const IMAGE_MIME: Record<string, string> = { image: "image/jpeg" };

/**
 * تحليل مرفق واحد بالذكاء الاصطناعي — صور/PDF بترسل مباشرة كـ Media
 * (نفس نمط lib/ai/agents/transcription-agent.ts)، DOCX بيتستخرج نصها
 * أولًا بـ mammoth، CSV نص خام مباشر. XLSX متعمّدة "unsupported" حاليًا:
 * مكتبة xlsx على npm عندها ثغرتين أمان عاليتين بلا إصلاح متاح (Prototype
 * Pollution + ReDoS) — رفضنا نضيفها؛ الملف بيتخزّن ويتحمّل عاديًا، بس
 * من غير تحليل AI لحد ما تتلاقى مكتبة بديلة آمنة.
 */
export async function analyzeMeetingAttachment(supabase: SupabaseClient, attachmentId: string): Promise<void> {
  const { data: attachment } = await supabase.from("meeting_attachments").select("*").eq("id", attachmentId).maybeSingle();
  if (!attachment) return;
  const row = attachment as MeetingAttachment;

  await supabase.from("meeting_attachments").update({ ai_status: "analyzing" }).eq("id", attachmentId);

  if (row.file_type === "xlsx") {
    await supabase
      .from("meeting_attachments")
      .update({ ai_status: "unsupported", last_error: "تحليل ملفات Excel غير مدعوم حاليًا (لا توجد مكتبة معالجة آمنة)." })
      .eq("id", attachmentId);
    return;
  }

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from(BUCKET).download(row.storage_path);
    if (downloadError || !fileBlob) {
      throw new Error(downloadError?.message ?? "تعذّر تحميل الملف من التخزين.");
    }
    const arrayBuffer = await fileBlob.arrayBuffer();

    let prompt: string;
    let media: { mimeType: string; data: string } | undefined;

    if (row.file_type === "image" || row.file_type === "pdf") {
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = row.file_type === "pdf" ? "application/pdf" : IMAGE_MIME.image;
      media = { mimeType, data: base64 };
      prompt = buildMeetingFileAnalysisPrompt(row.title, row.description, null);
    } else if (row.file_type === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      prompt = buildMeetingFileAnalysisPrompt(row.title, row.description, result.value);
    } else if (row.file_type === "csv") {
      const text = Buffer.from(arrayBuffer).toString("utf-8").slice(0, 20_000);
      prompt = buildMeetingFileAnalysisPrompt(row.title, row.description, text);
    } else {
      await supabase
        .from("meeting_attachments")
        .update({ ai_status: "unsupported", last_error: "نوع ملف غير مدعوم للتحليل بالذكاء الاصطناعي." })
        .eq("id", attachmentId);
      return;
    }

    const response = await AIService.execute(AITaskType.MEETING_FILE_ANALYSIS, prompt, { projectId: row.project_id, media });
    if (!response.success) {
      await supabase
        .from("meeting_attachments")
        .update({ ai_status: "failed", last_error: response.error?.message ?? "فشل تحليل المرفق." })
        .eq("id", attachmentId);
      return;
    }

    const validation = validateMeetingFileAnalysis(response.output);
    if (!validation.ok) {
      await supabase.from("meeting_attachments").update({ ai_status: "failed", last_error: "لم نتمكن من فهم نتيجة التحليل." }).eq("id", attachmentId);
      return;
    }

    const linkedIds = row.meeting_id ? await linkEntitiesToMeetingItems(supabase, row.meeting_id, validation.data.entities) : { decisions: [], requirements: [], risks: [] };

    await supabase
      .from("meeting_attachments")
      .update({
        ai_status: "ready",
        ai_summary: validation.data.summary,
        ai_confidence: validation.data.confidence,
        extracted_entities: { entities: validation.data.entities },
        related_decision_ids: linkedIds.decisions,
        related_requirement_ids: linkedIds.requirements,
        related_risk_ids: linkedIds.risks,
        last_error: null,
      })
      .eq("id", attachmentId);
  } catch (err) {
    console.error(`[AttachmentAnalysis] Unexpected failure for attachment ${attachmentId}:`, err);
    await supabase
      .from("meeting_attachments")
      .update({ ai_status: "failed", last_error: err instanceof Error ? err.message : "خطأ غير متوقع." })
      .eq("id", attachmentId);
  }
}

/**
 * ربط بسيط بالكلمات المفتاحية (مش Embeddings) — لكل كيان مستخرج من
 * المرفق، بندوّر عليه كنص فرعي جوّه قرارات/متطلبات/مخاطر نفس الاجتماع.
 * مقصود يكون بسيط وسريع؛ ربط دلالي أعمق (Embeddings) موصّى بيه كتحسين
 * مستقبلي في تقرير الترحيل.
 */
async function linkEntitiesToMeetingItems(
  supabase: SupabaseClient,
  meetingId: string,
  entities: string[]
): Promise<{ decisions: string[]; requirements: string[]; risks: string[] }> {
  if (entities.length === 0) return { decisions: [], requirements: [], risks: [] };

  const [{ data: decisions }, { data: requirements }, { data: risks }] = await Promise.all([
    supabase.from("meeting_decisions").select("id, text").eq("meeting_id", meetingId),
    supabase.from("meeting_requirements").select("id, text").eq("meeting_id", meetingId),
    supabase.from("meeting_risks").select("id, text").eq("meeting_id", meetingId),
  ]);

  const matches = (rows: { id: string; text: string }[] | null) =>
    (rows ?? [])
      .filter((row) => entities.some((entity) => entity.length > 2 && row.text.toLowerCase().includes(entity.toLowerCase())))
      .map((row) => row.id);

  return {
    decisions: matches(decisions as { id: string; text: string }[] | null),
    requirements: matches(requirements as { id: string; text: string }[] | null),
    risks: matches(risks as { id: string; text: string }[] | null),
  };
}
export { detectAttachmentFileType as detectFileTypeFromExt };
