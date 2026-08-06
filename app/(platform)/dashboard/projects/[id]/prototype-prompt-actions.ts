"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PrototypePromptGenerationEngine,
  type PromptGenerationResult,
} from "@/lib/prototype-prompt/generation-service";
import { applyManualSectionEdit } from "@/lib/prototype-prompt/versioning";
import type { PrototypePromptSectionKey, PrototypePromptVersion } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * توليد الـ Prototype Prompt كـ Background Job: بنحجز الـ Lock ونرجّع
 * فورًا ("started")، والتوليد الفعلي (مع الانتظار على Rate Limit) بيحصل
 * في after() بعد ما الاستجابة ترجع. كده حالة "جاري التوليد" بتتحفظ في
 * الـ DB وبتفضل ظاهرة حتى لو المستخدم عمل Refresh أو ساب الصفحة ورجع —
 * نفس أسلوب Discovery Analysis. الواجهة بتعمل Polling لحد ما تخلص.
 */
export async function generateFullPrototypePrompt(
  projectId: string,
  targetTool: string,
  isRegeneration: boolean
): Promise<PromptGenerationResult> {
  const actorId = await getActorId();

  const claimed = await PrototypePromptGenerationEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PrototypePromptGenerationEngine.runFullGenerationCore(
        projectId,
        targetTool,
        isRegeneration ? "conflict_replace" : "full_generation",
        actorId
      );
    } catch (err) {
      console.error("[PrototypePrompt background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function regeneratePrototypePromptSection(
  projectId: string,
  sectionKey: PrototypePromptSectionKey
): Promise<PromptGenerationResult> {
  const actorId = await getActorId();
  const result = await PrototypePromptGenerationEngine.regenerateSection(
    projectId,
    sectionKey,
    actorId
  );
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editPrototypePromptSection(
  projectId: string,
  sectionKey: PrototypePromptSectionKey,
  value: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSectionEdit(supabase, projectId, sectionKey, value, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getPrototypePromptVersions(projectId: string): Promise<PrototypePromptVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prototype_prompt_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as PrototypePromptVersion[];
}
