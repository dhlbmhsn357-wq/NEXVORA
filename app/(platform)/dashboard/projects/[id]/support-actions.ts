"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateSupportRequestStatus } from "@/lib/support/request-service";
import { getSupportAttachmentUrl } from "@/lib/storage/support-attachments";
import { proposeSupportFeedbackChange } from "@/lib/brain-v2/support-feedback-integration";
import type { SupportResolutionStatus } from "@/lib/types/database";

export async function getSupportAttachmentSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  return getSupportAttachmentUrl(supabase, path);
}

export async function generateWidgetKey(projectId: string): Promise<{ ok: boolean; key?: string }> {
  const supabase = await createClient();
  const key = crypto.randomUUID();

  const { error } = await supabase
    .from("projects")
    .update({
      widget_key: key,
      widget_key_created_at: new Date().toISOString(),
      widget_key_last_used_at: null,
    })
    .eq("id", projectId);
  if (error) return { ok: false };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, key };
}

export async function revokeWidgetKey(projectId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      widget_key: null,
      widget_key_created_at: null,
      widget_key_last_used_at: null,
    })
    .eq("id", projectId);
  if (error) return { ok: false };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function changeSupportRequestStatus(
  projectId: string,
  requestId: string,
  status: SupportResolutionStatus
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  await updateSupportRequestStatus(supabase, requestId, status);

  if (status === "resolved") {
    try {
      await proposeSupportFeedbackChange(projectId, requestId);
    } catch (err) {
      console.error(`[Support] proposeSupportFeedbackChange threw for request ${requestId}:`, err);
    }
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function assignSupportRequest(
  projectId: string,
  requestId: string,
  assigneeId: string | null
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("support_requests")
    .update({ assigned_to: assigneeId })
    .eq("id", requestId);

  if (error) return { ok: false };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
