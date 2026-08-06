"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PRDGenerationEngine, type GenerationResult } from "@/lib/prd/generation-service";
import { applyManualSectionEdit } from "@/lib/prd/versioning";
import type { PRDSectionKey, PRDVersion } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * توليد PRD كـ Background Job: بنحجز الـ Lock ونرجّع فورًا ("started")،
 * والتوليد الفعلي (مع الانتظار على Rate Limit) بيحصل في after() — نفس
 * أسلوب Prototype Prompt. كده حالة "جاري التوليد" بتفضل ظاهرة حتى لو
 * المستخدم عمل Refresh أو ساب الصفحة ورجع.
 */
export async function generateFullPRD(
  projectId: string,
  isRegeneration: boolean
): Promise<GenerationResult> {
  const actorId = await getActorId();

  const claimed = await PRDGenerationEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PRDGenerationEngine.runFullGenerationCore(
        projectId,
        isRegeneration ? "conflict_replace" : "full_generation",
        actorId
      );
    } catch (err) {
      console.error("[PRD background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function regeneratePRDSection(
  projectId: string,
  sectionKey: PRDSectionKey
): Promise<GenerationResult> {
  const actorId = await getActorId();
  const result = await PRDGenerationEngine.regenerateSection(projectId, sectionKey, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editPRDSection(
  projectId: string,
  sectionKey: PRDSectionKey,
  value: unknown
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSectionEdit(supabase, projectId, sectionKey, value, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getPRDVersions(projectId: string): Promise<PRDVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prd_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as PRDVersion[];
}
