import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssembledPrompt, PromptSource, PromptReadinessResult } from "./types";

export interface PromptGenerationRow {
  id: string;
  project_id: string | null;
  stage: string;
  profile: string;
  target: string;
  version: number;
  prompt_text: string;
  sources: PromptSource[];
  ai_model: string | null;
  readiness_score: number | null;
  readiness_deductions: PromptReadinessResult["deductions"];
  improved_from_id: string | null;
  created_by: string | null;
  created_at: string;
}

const COLUMNS =
  "id, project_id, stage, profile, target, version, prompt_text, sources, ai_model, readiness_score, readiness_deductions, improved_from_id, created_by, created_at";

/**
 * Versioning عام لأي برومبت مُولَّد — بيخزّن النص المُركّب + مصادره +
 * درجة الجاهزية + الـ Profile في جدول prompt_generations المشترك، بإصدار
 * تصاعدي لكل (project, stage). أي مرحلة بتستخدم نفس الدالة دي.
 */
export async function persistPromptGeneration(
  supabase: SupabaseClient,
  params: {
    projectId: string | null;
    stage: string;
    assembled: AssembledPrompt;
    sources: PromptSource[];
    readiness: PromptReadinessResult;
    aiModel?: string | null;
    improvedFromId?: string | null;
    actorId?: string | null;
  }
): Promise<{ ok: boolean; id?: string; version?: number; message?: string }> {
  // الإصدار التالي لنفس (project, stage)
  let query = supabase
    .from("prompt_generations")
    .select("version")
    .eq("stage", params.stage)
    .order("version", { ascending: false })
    .limit(1);
  query = params.projectId ? query.eq("project_id", params.projectId) : query.is("project_id", null);
  const { data: last } = await query.maybeSingle();
  const nextVersion = ((last?.version as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from("prompt_generations")
    .insert({
      project_id: params.projectId,
      stage: params.stage,
      profile: params.assembled.metadata.profile,
      target: params.assembled.metadata.target,
      version: nextVersion,
      prompt_text: params.assembled.text,
      sources: params.sources,
      ai_model: params.aiModel ?? null,
      readiness_score: params.readiness.score,
      readiness_deductions: params.readiness.deductions,
      improved_from_id: params.improvedFromId ?? null,
      created_by: params.actorId ?? null,
    })
    .select("id, version")
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "تعذّر حفظ البرومبت." };
  return { ok: true, id: data.id as string, version: data.version as number };
}

/** سجل إصدارات برومبت مرحلة معيّنة لمشروع (الأحدث أولًا). */
export async function getPromptHistory(
  supabase: SupabaseClient,
  projectId: string | null,
  stage: string,
  limit = 20
): Promise<PromptGenerationRow[]> {
  let query = supabase
    .from("prompt_generations")
    .select(COLUMNS)
    .eq("stage", stage)
    .order("version", { ascending: false })
    .limit(limit);
  query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  const { data } = await query;
  return (data ?? []) as PromptGenerationRow[];
}

export async function getPromptGeneration(supabase: SupabaseClient, id: string): Promise<PromptGenerationRow | null> {
  const { data } = await supabase.from("prompt_generations").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as PromptGenerationRow) ?? null;
}
