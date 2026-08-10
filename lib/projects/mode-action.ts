"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";

export type ProjectMode = "unclassified" | "test" | "real";

/**
 * Owner/Admin-only. Changes projects.mode + writes an audit entry
 * capturing the previous mode, new mode, and reason.
 */
export async function updateProjectModeAction(
  projectId: string,
  newMode: ProjectMode,
  reason: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (newMode !== "unclassified" && newMode !== "test" && newMode !== "real") {
    return { ok: false, message: "قيمة mode غير صالحة." };
  }
  if (!reason.trim()) {
    return { ok: false, message: "السبب مطلوب لتغيير نوع المشروع." };
  }
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message ?? "ماعندكش صلاحية." };

  const svc = createServiceClient();
  const { data: current, error: readErr } = await svc
    .from("projects")
    .select("mode")
    .eq("id", projectId)
    .maybeSingle();
  if (readErr || !current) {
    return { ok: false, message: readErr?.message ?? "المشروع غير موجود." };
  }
  const previousMode = String((current as { mode?: string }).mode ?? "unclassified");

  const { error: updErr } = await svc
    .from("projects")
    .update({ mode: newMode })
    .eq("id", projectId);
  if (updErr) return { ok: false, message: updErr.message };

  try {
    await svc.from("audit_log").insert({
      actor_id: auth.userId,
      entity_type: "project",
      entity_id: projectId,
      action: "project.mode.changed",
      changes: { previousMode, newMode, reason },
    });
  } catch { /* audit failure is non-fatal */ }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
