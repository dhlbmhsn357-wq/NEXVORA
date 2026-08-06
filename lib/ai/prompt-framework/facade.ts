import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssembledPrompt, PromptProfileId, PromptReadinessResult, PromptSource, PromptTarget } from "./types";
import { getProfile } from "./profiles";
import { assemblePrompt } from "./assemble";
import { computePromptReadiness } from "./readiness";
import { buildContextResult, type ContextItem } from "./context-engine";
import { persistPromptGeneration } from "./prompt-generation-service";

export interface BuildPromptResult {
  assembled: AssembledPrompt;
  readiness: PromptReadinessResult;
  sources: PromptSource[];
  generationId: string | null;
  version: number | null;
}

/**
 * الواجهة العليا للـ Framework — نقطة واحدة أي مرحلة بتستدعيها لتوليد
 * برومبت موحّد: تبني السياق → تحسب الجاهزية → تركّب البرومبت → تخزّنه
 * كإصدار جديد. بترجّع البرومبت الجاهز للإرسال لـ AIService.execute +
 * الجاهزية + معرّف الإصدار. `persist=false` لو عايز تركيب بلا حفظ.
 */
export async function buildFrameworkPrompt(
  supabase: SupabaseClient,
  input: {
    projectId: string | null;
    stage: string;
    profileId: PromptProfileId;
    stageBody: string;
    contextItems: ContextItem[];
    target?: PromptTarget;
    persona?: string;
    aiModel?: string | null;
    actorId?: string | null;
    persist?: boolean;
  }
): Promise<BuildPromptResult> {
  const profile = getProfile(input.profileId);
  const ctx = buildContextResult(input.contextItems);
  const readiness = computePromptReadiness(profile, ctx.presentKeys);
  const assembled = assemblePrompt({
    profile,
    stageBody: input.stageBody,
    context: ctx.blocks,
    target: input.target,
    persona: input.persona,
  });

  let generationId: string | null = null;
  let version: number | null = null;
  if (input.persist !== false) {
    const saved = await persistPromptGeneration(supabase, {
      projectId: input.projectId,
      stage: input.stage,
      assembled,
      sources: ctx.sources,
      readiness,
      aiModel: input.aiModel,
      actorId: input.actorId,
    });
    if (saved.ok) {
      generationId = saved.id ?? null;
      version = saved.version ?? null;
    }
  }

  return { assembled, readiness, sources: ctx.sources, generationId, version };
}
