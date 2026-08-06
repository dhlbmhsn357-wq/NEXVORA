import { AIService } from "../service";
import { AITaskType } from "../types";
import { buildTranscriptionPrompt } from "../prompts/transcription";

export type TranscriptionAgentResult =
  | { status: "success"; text: string }
  | { status: "error"; message: string; code: string };

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

/**
 * Transcription Agent — مسؤولية واحدة: يبعت الملف الصوتي لـ AIService
 * (task_type = TRANSCRIPTION) ويرجّع النص الخام. لا يعدّل النص ولا
 * يلخّصه ولا يحفظه في قاعدة البيانات.
 */
export class TranscriptionAgent {
  static async run(
    audioBuffer: ArrayBuffer,
    mimeType: string,
    context?: { projectId?: string; meetingId?: string }
  ): Promise<TranscriptionAgentResult> {
    const response = await AIService.execute(AITaskType.TRANSCRIPTION, buildTranscriptionPrompt(), {
      projectId: context?.projectId,
      media: { mimeType, data: base64FromArrayBuffer(audioBuffer) },
    });

    if (!response.success || !response.output) {
      console.error(
        `[TranscriptionAgent] Failed for meeting ${context?.meetingId}: ${response.error?.code} — ${response.error?.message}`
      );
      return {
        status: "error",
        message: response.error?.message ?? "لم يتم استلام نص من عملية التفريغ.",
        code: response.error?.code ?? "EMPTY_TRANSCRIPT",
      };
    }

    return { status: "success", text: response.output };
  }
}
