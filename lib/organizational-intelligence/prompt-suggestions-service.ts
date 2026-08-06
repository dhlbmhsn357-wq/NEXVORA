import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildPromptImprovementPrompt } from "@/lib/ai/prompts/organizational-intelligence";
import { validatePromptSuggestion } from "@/lib/ai/validation/organizational-intelligence";
import { detectOutcomeSignals, type OutcomeSignalInput } from "./outcome-signals";
import { PROMPT_PURPOSE_MAP, PROMPT_REFERENCE_MAP } from "./prompt-reference-map";

async function gatherOutcomeSignalInput(supabase: SupabaseClient, projectId: string): Promise<OutcomeSignalInput> {
  const [certResult, supportResult] = await Promise.all([
    supabase
      .from("engineering_certificates")
      .select("overall_score")
      .eq("project_id", projectId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("support_requests").select("request_type, resolution_status, satisfaction_rating").eq("project_id", projectId),
  ]);

  const supportRows = (supportResult.data ?? []) as Array<{ request_type: string; resolution_status: string; satisfaction_rating: number | null }>;
  const negativeSatisfactionCount = supportRows.filter((r) => r.resolution_status === "resolved" && r.satisfaction_rating === -1).length;
  const changeRequestCount = supportRows.filter((r) => r.request_type === "change_request").length;

  return {
    eqaOverallScore: certResult.data?.overall_score ?? null,
    negativeSatisfactionCount,
    changeRequestCount,
  };
}

/**
 * سجل اقتراحات تحسين برومبت — بيتشغّل عند أرشفة مشروع (نفس نقطة
 * استخراج المعرفة)، لكن بس لو فيه إشارة نتيجة سيئة حقيقية (mechanical
 * gate في outcome-signals.ts). كل اقتراح للمراجعة اليدوية فقط — مفيش أي
 * تعديل تلقائي لملفات البرومبت الفعلية.
 */
export class PromptSuggestionsEngine {
  static async generateForProject(projectId: string): Promise<{ generated: number }> {
    const supabase = createServiceClient();
    const input = await gatherOutcomeSignalInput(supabase, projectId);
    const signals = detectOutcomeSignals(input);
    if (signals.length === 0) return { generated: 0 };

    let generated = 0;
    for (const signal of signals) {
      const promptReference = PROMPT_REFERENCE_MAP[signal.taskType];
      const promptPurpose = PROMPT_PURPOSE_MAP[signal.taskType];
      if (!promptReference || !promptPurpose) continue;

      const prompt = buildPromptImprovementPrompt(promptReference, promptPurpose, signal.reason);
      const aiResponse = await AIService.execute(AITaskType.PROMPT_IMPROVEMENT_SUGGESTION, prompt, { projectId });
      if (!aiResponse.success) continue;

      const validated = validatePromptSuggestion(aiResponse.output);
      if (!validated.ok) continue;

      const { error } = await supabase.from("prompt_improvement_suggestions").insert({
        task_type: signal.taskType,
        prompt_reference: promptReference,
        suggestion: validated.data.suggestion,
        rationale: validated.data.rationale,
        supporting_project_ids: [projectId],
        confidence_score: validated.data.confidence_score,
        status: "suggested",
      });
      if (!error) generated++;
    }

    return { generated };
  }

  static async getAll() {
    const supabase = createServiceClient();
    const { data } = await supabase.from("prompt_improvement_suggestions").select("*").order("created_at", { ascending: false });
    return { suggestions: data ?? [] };
  }

  static async setStatus(suggestionId: string, status: "applied" | "dismissed"): Promise<void> {
    const supabase = createServiceClient();
    await supabase.from("prompt_improvement_suggestions").update({ status }).eq("id", suggestionId);
  }
}
