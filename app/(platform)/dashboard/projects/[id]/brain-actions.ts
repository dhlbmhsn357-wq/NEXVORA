"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ProjectBrainSyncService, type SyncResult } from "@/lib/brain/sync-service";
import {
  applyManualSummaryEdit,
  acceptPendingProposal,
  dismissPendingProposal,
} from "@/lib/brain/versioning";
import type { OpenQuestionItem } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

export async function resyncProjectBrain(projectId: string): Promise<SyncResult> {
  const actorId = await getActorId();
  const result = await ProjectBrainSyncService.sync(projectId, "manual_resync", actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editBrainSummary(
  projectId: string,
  newSummary: string
): Promise<{ ok: boolean; message?: string }> {
  if (!newSummary.trim()) {
    return { ok: false, message: "الملخص لا يمكن أن يكون فارغًا." };
  }
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSummaryEdit(supabase, projectId, newSummary.trim(), actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function acceptBrainProposal(projectId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await acceptPendingProposal(supabase, projectId, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function keepCurrentSummary(projectId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  await dismissPendingProposal(supabase, projectId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function toggleQuestionAnswered(
  projectId: string,
  questionIndex: number,
  answered: boolean
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: brain } = await supabase
    .from("project_brain")
    .select("open_questions")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!brain) return { ok: false };

  const questions = (brain.open_questions ?? []) as OpenQuestionItem[];
  if (!questions[questionIndex]) return { ok: false };

  questions[questionIndex] = { ...questions[questionIndex], answered };

  await supabase
    .from("project_brain")
    .update({ open_questions: questions })
    .eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
