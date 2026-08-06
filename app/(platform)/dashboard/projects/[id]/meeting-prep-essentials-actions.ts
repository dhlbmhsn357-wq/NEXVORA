"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; message: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** يحدّث العنوان والنتائج المتوقعة لتجهيز اجتماع موجود. */
export async function updateMeetingPrepEssentialsAction(
  meetingPreparationId: string,
  projectId: string,
  title: string,
  expectedOutcomes: string[]
): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!userId) return { ok: false, message: "غير مسجّل دخول." };

  const { error } = await supabase
    .from("meeting_preparations")
    .update({ title: title.trim() || null, expected_outcomes: expectedOutcomes.map((o) => o.trim()).filter(Boolean) })
    .eq("id", meetingPreparationId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function addMeetingPrepParticipantAction(
  meetingPreparationId: string,
  projectId: string,
  fullName: string,
  role: string,
  isClient: boolean,
  isRequired: boolean
): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!userId) return { ok: false, message: "غير مسجّل دخول." };
  if (!fullName.trim()) return { ok: false, message: "الاسم مطلوب." };

  const { error } = await supabase
    .from("meeting_prep_participants")
    .insert({ meeting_preparation_id: meetingPreparationId, project_id: projectId, full_name: fullName.trim(), role: role.trim(), is_client: isClient, is_required: isRequired });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function removeMeetingPrepParticipantAction(participantId: string, projectId: string): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!userId) return { ok: false, message: "غير مسجّل دخول." };

  const { error } = await supabase.from("meeting_prep_participants").delete().eq("id", participantId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function addMeetingRequiredItemAction(
  meetingPreparationId: string,
  projectId: string,
  itemType: "file" | "image" | "document" | "spreadsheet",
  title: string,
  description: string
): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!userId) return { ok: false, message: "غير مسجّل دخول." };
  if (!title.trim()) return { ok: false, message: "العنوان مطلوب." };

  const { error } = await supabase
    .from("meeting_required_items")
    .insert({ meeting_preparation_id: meetingPreparationId, project_id: projectId, item_type: itemType, title: title.trim(), description: description.trim() });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function toggleMeetingRequiredItemAction(itemId: string, projectId: string, isProvided: boolean): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!userId) return { ok: false, message: "غير مسجّل دخول." };

  const { error } = await supabase.from("meeting_required_items").update({ is_provided: isProvided }).eq("id", itemId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function removeMeetingRequiredItemAction(itemId: string, projectId: string): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (!userId) return { ok: false, message: "غير مسجّل دخول." };

  const { error } = await supabase.from("meeting_required_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
