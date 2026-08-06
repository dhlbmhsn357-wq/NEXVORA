"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ClientPresentationGenerationEngine,
  type PresentationGenerationResult,
} from "@/lib/presentation/generation-service";
import { applyManualSlideEdit } from "@/lib/presentation/versioning";
import { getPresentationDownloadUrl } from "@/lib/storage/presentation-storage";
import type { ClientPresentationSlideKey, ClientPresentationVersion, PresentationLanguage } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * توليد العرض كـ Background Job: بنحجز الـ Lock ونرجّع فورًا ("started")،
 * والتوليد الفعلي (مع الانتظار على Rate Limit وتوليد ملف PPTX) بيحصل في
 * after() — نفس أسلوب PRD/Prototype Prompt.
 */
export async function generateClientPresentation(
  projectId: string,
  projectName: string,
  language: PresentationLanguage = "ar"
): Promise<PresentationGenerationResult> {
  const actorId = await getActorId();

  const claimed = await ClientPresentationGenerationEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await ClientPresentationGenerationEngine.runFullGenerationCore(projectId, projectName, actorId, "full_generation", language);
    } catch (err) {
      console.error("[ClientPresentation background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function regeneratePresentationSlide(
  projectId: string,
  projectName: string,
  slideKey: ClientPresentationSlideKey
): Promise<PresentationGenerationResult> {
  const actorId = await getActorId();
  const result = await ClientPresentationGenerationEngine.regenerateSlide(
    projectId,
    projectName,
    slideKey,
    actorId
  );
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editPresentationSlide(
  projectId: string,
  slideKey: ClientPresentationSlideKey,
  value: unknown
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSlideEdit(supabase, projectId, slideKey, value, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function generateShareLink(projectId: string): Promise<{ ok: boolean; token?: string }> {
  const supabase = await createClient();
  const token = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("client_presentations")
    .update({
      share_token: token,
      share_token_created_at: new Date().toISOString(),
      share_token_last_used_at: null,
    })
    .eq("project_id", projectId);

  if (error) return { ok: false };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, token };
}

export async function revokeShareLink(projectId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_presentations")
    .update({
      share_token: null,
      share_token_created_at: null,
      share_token_last_used_at: null,
    })
    .eq("project_id", projectId);

  if (error) return { ok: false };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function downloadPresentationPptx(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  return getPresentationDownloadUrl(supabase, storagePath);
}

export async function getPresentationVersions(projectId: string): Promise<ClientPresentationVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_presentation_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as ClientPresentationVersion[];
}
