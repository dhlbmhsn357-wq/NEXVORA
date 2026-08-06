"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getPromptHistory,
  getPromptGeneration,
  persistPromptGeneration,
  improvePrompt,
  getProfile,
  type PromptGenerationRow,
} from "@/lib/ai/prompt-framework";
import type { PromptProfileId } from "@/lib/ai/prompt-framework";

/** سجل إصدارات البرومبت لمرحلة معيّنة (Prompt Studio — History + Score). */
export async function getPromptStudioHistory(
  projectId: string,
  stage: string
): Promise<{ ok: boolean; history: PromptGenerationRow[]; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, history: [], message: auth.message };
  const supabase = createServiceClient();
  const history = await getPromptHistory(supabase, projectId, stage, 20);
  return { ok: true, history };
}

/**
 * "Improve Prompt" — يحسّن أحدث برومبت مُولَّد لمرحلة عبر AI Provider Layer
 * (قفل Scope صارم)، ويخزّن الناتج كإصدار جديد مرتبط بالأصل (improved_from_id).
 */
export async function improvePromptStudio(
  projectId: string,
  stage: string
): Promise<{ ok: boolean; message?: string; version?: number }> {
  const auth = await requireRole(["owner", "admin"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();
  const history = await getPromptHistory(supabase, projectId, stage, 1);
  const latest = history[0];
  if (!latest) return { ok: false, message: "لا يوجد برومبت لتحسينه بعد." };

  const profile = getProfile(latest.profile as PromptProfileId);
  const result = await improvePrompt(latest.prompt_text, { profileLabel: profile?.label ?? latest.profile, actorId: auth.userId });
  if (!result.ok) return { ok: false, message: result.message };

  const saved = await persistPromptGeneration(supabase, {
    projectId,
    stage,
    assembled: {
      text: result.improved,
      metadata: {
        profile: latest.profile as PromptProfileId,
        target: latest.target as "gemini" | "claude_code",
        ruleKeys: profile?.ruleKeys ?? [],
        claudeCodeWorkflowInjected: latest.target === "claude_code",
        contextBlockTitles: [],
      },
    },
    sources: latest.sources,
    readiness: { score: latest.readiness_score ?? 0, deductions: latest.readiness_deductions ?? [] },
    aiModel: latest.ai_model,
    improvedFromId: latest.id,
    actorId: auth.userId,
  });
  if (!saved.ok) return { ok: false, message: saved.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, version: saved.version };
}

/** جلب نص برومبت مُولَّد كامل (للنسخ/العرض). */
export async function getPromptStudioText(id: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const supabase = createServiceClient();
  const row = await getPromptGeneration(supabase, id);
  if (!row) return { ok: false, message: "غير موجود." };
  return { ok: true, text: row.prompt_text };
}
