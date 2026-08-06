"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DeveloperHandoffGenerationEngine,
  type DeveloperHandoffGenerationResult,
} from "@/lib/developer-handoff/generation-service";
import { applyManualSectionEdit, applyStatusChange } from "@/lib/developer-handoff/versioning";
import { validateAccessCredentialsRef } from "@/lib/developer-handoff/credentials-guard";
import type {
  DeveloperHandoffSectionKey,
  DeveloperHandoffStatus,
  DeveloperHandoffVersion,
} from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * توليد حزمة Developer Handoff كـ Background Job. الفحوصات المبدئية
 * (no_review/major_gaps_warning) بتحصل قبل أي حجز عشان الواجهة تقدر
 * تعرض تأكيد للمستخدم؛ بعد كده بنحجز الـ Lock ونرجّع فورًا ("started")
 * والتوليد الفعلي بيحصل في after().
 */
export async function generateDeveloperHandoff(
  projectId: string,
  confirmContinueWithGaps?: boolean
): Promise<DeveloperHandoffGenerationResult> {
  const actorId = await getActorId();

  const pre = await DeveloperHandoffGenerationEngine.precheck(projectId, { confirmContinueWithGaps });
  if (!pre.ok) return pre.result;

  const claimed = await DeveloperHandoffGenerationEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await DeveloperHandoffGenerationEngine.runFullGenerationCore(projectId, actorId);
    } catch (err) {
      console.error("[DeveloperHandoff background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function editDeveloperHandoffSection(
  projectId: string,
  sectionKey: DeveloperHandoffSectionKey,
  value: unknown
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSectionEdit(supabase, projectId, sectionKey, value, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function changeDeveloperHandoffStatus(
  projectId: string,
  status: DeveloperHandoffStatus
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyStatusChange(supabase, projectId, status, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function updateAccessCredentialsRef(
  projectId: string,
  value: string
): Promise<{ ok: boolean; reason?: string }> {
  const check = validateAccessCredentialsRef(value);
  if (!check.ok) return { ok: false, reason: check.reason };

  const supabase = await createClient();
  await supabase
    .from("developer_handoff")
    .update({ access_credentials_ref: value.trim() || null })
    .eq("project_id", projectId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getDeveloperHandoffVersions(projectId: string): Promise<DeveloperHandoffVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("developer_handoff_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as DeveloperHandoffVersion[];
}

export async function generateHandoffShareLink(projectId: string): Promise<{ ok: boolean; token?: string }> {
  const supabase = await createClient();
  const token = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("developer_handoff")
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

export async function revokeHandoffShareLink(projectId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("developer_handoff")
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
