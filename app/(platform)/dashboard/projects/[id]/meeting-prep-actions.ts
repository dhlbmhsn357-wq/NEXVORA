"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireRole } from "@/lib/auth/rbac";
import {
  regenerateMeetingPrepSection,
  runMeetingPreparationJob,
  saveMeetingPrepManualEdit,
} from "@/lib/meeting-prep/service";
import type { MeetingPrepSectionKey } from "@/lib/meeting-prep/types";

type Result = { ok: boolean; message?: string; conflict?: boolean };

/** إعادة توليد التجهيز بالكامل (كل الـ13 قسم، متوازيًا). */
export async function regenerateMeetingPreparation(projectId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false, message: "المشروع غير موجود." };

  const svc = createServiceClient();
  await svc
    .from("meeting_preparations")
    .update({ status: "generating" })
    .eq("project_id", projectId);

  after(async () => {
    try {
      await runMeetingPreparationJob(projectId, { actorId: auth.userId ?? null });
    } catch (err) {
      console.error("[MeetingPrep regenerate-all] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

/** إعادة توليد قسم واحد فقط. */
export async function regenerateMeetingPrepSectionAction(
  projectId: string,
  sectionKey: MeetingPrepSectionKey
): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await regenerateMeetingPrepSection(projectId, sectionKey, auth.userId ?? null);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

/** تعديل يدوي لقسم — أي عضو مسجّل دخول، بحماية Optimistic Lock. */
export async function saveMeetingPrepSectionEdit(input: {
  projectId: string;
  sectionKey: MeetingPrepSectionKey;
  newContent: unknown;
  expectedUpdatedAt: string;
  reason: string | null;
}): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await saveMeetingPrepManualEdit({
    projectId: input.projectId,
    sectionKey: input.sectionKey,
    newContent: input.newContent,
    expectedUpdatedAt: input.expectedUpdatedAt,
    reason: input.reason,
    actorId: auth.userId ?? null,
  });
  if (!result.ok) return { ok: false, message: result.message, conflict: result.conflict };
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true };
}
