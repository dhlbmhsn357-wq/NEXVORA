import { AIService } from "../service";
import { AITaskType } from "../types";
import { buildMeetingExtractionPromptV2 } from "../prompts/meeting-extraction-v2";
import { validateMeetingExtractionV2 } from "../validation/meeting-extraction-v2";
import type { MeetingExtractionV2 } from "@/lib/types/database";

export type MeetingExtractionV2AgentResult =
  | { status: "success"; data: MeetingExtractionV2 }
  | { status: "error"; message: string; code: string };

/**
 * نسخة Phase 2 من MeetingExtractionAgent — بترجع 13 فئة بدل 5، كل عنصر
 * بثقة/دليل. تعمل بجانب MeetingExtractionAgent القديم (مش بديلة له)،
 * عشان أي كود موجود بيعتمد على MeetingExtraction القديمة (Brain v1/v2
 * merge, Meeting Review) يفضل شغّال زي ما هو تمامًا.
 */
export class MeetingExtractionV2Agent {
  static async run(
    transcript: string,
    context?: { projectId?: string; meetingId?: string }
  ): Promise<MeetingExtractionV2AgentResult> {
    const prompt = buildMeetingExtractionPromptV2(transcript);

    const response = await AIService.execute(AITaskType.MEETING_EXTRACTION_V2, prompt, {
      projectId: context?.projectId,
    });

    if (!response.success) {
      console.error(
        `[MeetingExtractionV2Agent] Failed for meeting ${context?.meetingId}: ${response.error?.code} — ${response.error?.message}`
      );
      return {
        status: "error",
        message: response.error?.message ?? "فشل الاستخراج الغني لبيانات الاجتماع.",
        code: response.error?.code ?? "UNKNOWN",
      };
    }

    const validation = validateMeetingExtractionV2(response.output);
    if (!validation.ok) {
      console.error(
        `[MeetingExtractionV2Agent] Validation failed for meeting ${context?.meetingId}: ${validation.reason}`
      );
      return { status: "error", message: "لم نتمكن من فهم نتيجة الاستخراج الغني.", code: "INVALID_RESPONSE" };
    }

    return { status: "success", data: validation.data };
  }
}
