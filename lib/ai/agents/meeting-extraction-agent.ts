import { AIService } from "../service";
import { AITaskType } from "../types";
import { buildMeetingExtractionPrompt } from "../prompts/meeting-extraction";
import { validateMeetingExtraction } from "../validation/meeting-extraction";
import type { MeetingExtraction } from "@/lib/types/database";

export type MeetingExtractionAgentResult =
  | { status: "success"; data: MeetingExtraction }
  | { status: "error"; message: string; code: string };

/**
 * Meeting Extraction Agent — مسؤولية واحدة: يبني الـ Prompt من النص
 * المفرّغ، يستدعي AIService (task_type = MEETING_EXTRACTION)، يتحقق
 * من صحة الرد. لا يحفظ في قاعدة البيانات ولا يلمس Project Brain.
 */
export class MeetingExtractionAgent {
  static async run(
    transcript: string,
    context?: { projectId?: string; meetingId?: string }
  ): Promise<MeetingExtractionAgentResult> {
    const prompt = buildMeetingExtractionPrompt(transcript);

    const response = await AIService.execute(AITaskType.MEETING_EXTRACTION, prompt, {
      projectId: context?.projectId,
    });

    if (!response.success) {
      console.error(
        `[MeetingExtractionAgent] Failed for meeting ${context?.meetingId}: ${response.error?.code} — ${response.error?.message}`
      );
      return {
        status: "error",
        message: response.error?.message ?? "فشل استخراج بيانات الاجتماع.",
        code: response.error?.code ?? "UNKNOWN",
      };
    }

    const validation = validateMeetingExtraction(response.output);
    if (!validation.ok) {
      console.error(
        `[MeetingExtractionAgent] Validation failed for meeting ${context?.meetingId}: ${validation.reason}`
      );
      return { status: "error", message: "لم نتمكن من فهم نتيجة الاستخراج.", code: "INVALID_RESPONSE" };
    }

    return { status: "success", data: validation.data };
  }
}
