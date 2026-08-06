import { createClient } from "@/lib/supabase/server";
import { AIService } from "../service";
import { AITaskType } from "../types";
import { buildProjectAnalysisPrompt } from "../prompts/project-analysis";
import { validateProjectAnalysis } from "../validation/project-analysis";
import { buildDiscoveryPairs } from "@/lib/discovery-templates/snapshot";
import type {
  ProjectAnalysis,
  ProjectType,
  BrainEntryType,
  DiscoverySnapshotItem,
} from "@/lib/types/database";

export type AnalysisAgentResult =
  | { status: "success"; data: ProjectAnalysis }
  | { status: "insufficient_data"; message: string }
  | { status: "error"; message: string; code: string };

function mapErrorToUserMessage(code?: string): string {
  switch (code) {
    case "TIMEOUT":
      return "استغرق التحليل وقتًا أطول من المتوقع، حاول مرة أخرى.";
    case "RATE_LIMIT":
      return "تم تجاوز الحد المسموح من الطلبات حاليًا، حاول بعد قليل.";
    case "AUTHENTICATION":
    case "CONFIGURATION":
      return "خدمة التحليل غير مُعدّة بشكل صحيح حاليًا، تواصل مع مسؤول النظام.";
    default:
      return "حدث خطأ أثناء الاتصال بخدمة التحليل، حاول مرة أخرى لاحقًا.";
  }
}

/**
 * Analysis Agent — مسؤوليته فقط: جمع بيانات المشروع (نموذج الاكتشاف +
 * Project Brain)، تجهيزها، إرسالها لـ AIService، استقبال النتيجة،
 * التحقق منها. لا يحفظ في قاعدة البيانات ولا يعرض واجهة — ده شغل
 * الـ Server Action والمكوّنات اللي بتستدعيه.
 */
export class AnalysisAgent {
  static async run(projectId: string, actorId?: string): Promise<AnalysisAgentResult> {
    const supabase = await createClient();

    const { data: project } = await supabase
      .from("projects")
      .select("id, project_type")
      .eq("id", projectId)
      .single();

    if (!project) {
      return { status: "error", message: "المشروع غير موجود.", code: "NOT_FOUND" };
    }

    const [{ data: discoveryForm }, { data: brainEntries }] = await Promise.all([
      supabase
        .from("discovery_forms")
        .select("answers, questions_snapshot")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_brain_entries")
        .select("entry_type, content")
        .eq("project_id", projectId),
    ]);

    const answers = (discoveryForm?.answers ?? {}) as Record<string, unknown>;
    const snapshot = (discoveryForm?.questions_snapshot ?? null) as
      | DiscoverySnapshotItem[]
      | null;
    const discoveryPairs = buildDiscoveryPairs(answers, snapshot);
    const entries = (brainEntries ?? []) as Array<{
      entry_type: BrainEntryType;
      content: string;
    }>;

    const hasDiscoveryData = Object.values(answers).some(
      (v) => v !== undefined && v !== null && v !== ""
    );
    const hasBrainData = entries.length > 0;

    if (!hasDiscoveryData && !hasBrainData) {
      return {
        status: "insufficient_data",
        message:
          "بيانات المشروع غير كافية للتحليل — أضف إجابات في نموذج الاكتشاف أو ملاحظات في Project Brain أولاً.",
      };
    }

    const prompt = buildProjectAnalysisPrompt({
      projectType: project.project_type as ProjectType,
      discoveryAnswers: answers,
      discoveryPairs,
      brainEntries: entries,
    });

    const response = await AIService.execute(AITaskType.PROJECT_ANALYSIS, prompt, {
      actorId,
      projectId,
    });

    if (!response.success) {
      console.error(
        `[AnalysisAgent] AI request failed for project ${projectId}: ${response.error?.code} — ${response.error?.message}`
      );
      return {
        status: "error",
        message: mapErrorToUserMessage(response.error?.code),
        code: response.error?.code ?? "UNKNOWN",
      };
    }

    const validation = validateProjectAnalysis(response.output);
    if (!validation.ok) {
      console.error(
        `[AnalysisAgent] Validation failed for project ${projectId}: ${validation.reason}`
      );
      return {
        status: "error",
        message: "لم نتمكن من فهم نتيجة التحليل، حاول مرة أخرى.",
        code: "INVALID_RESPONSE",
      };
    }

    return { status: "success", data: validation.data };
  }
}
