"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { getFitGapNotes, upsertFitGapNotes, convertToFullDiscovery } from "@/lib/sector-standards/fit-gap-service";
import type { FitGapNotesRow, FitGapNotesInput } from "@/lib/sector-standards/fit-gap-types";

/**
 * Server Actions — Fit/Gap Notes + Convert-to-Full-Discovery (0126، المرحلة د)
 * نفس نمط ActionResult في sector-standard-actions.ts بالضبط.
 */
type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const BROAD_ROLES = ["owner", "admin", "supervisor", "member"] as const;
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guardBroad() {
  const g = await requireRole([...BROAD_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

async function guardWrite() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

export async function getFitGapNotesAction(projectId: string): Promise<ActionResult<FitGapNotesRow | null>> {
  const g = await guardBroad();
  if (!g.ok) return g;
  try {
    const data = await getFitGapNotes(projectId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب ملاحظات Fit/Gap." };
  }
}

/** حفظ ملاحظات Fit/Gap — محصور بأدوار الكتابة (owner/admin/supervisor)، نفس رتبة الاعتماد/التطبيق. */
export async function saveFitGapNotesAction(
  projectId: string,
  input: FitGapNotesInput
): Promise<ActionResult<FitGapNotesRow>> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    const data = await upsertFitGapNotes(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل حفظ ملاحظات Fit/Gap." };
  }
}

/** "تحويل إلى Full Discovery" — بنيوي، محصور بأدوار الكتابة. لا يحذف project_standard_links. */
export async function convertToFullDiscoveryAction(projectId: string): Promise<ActionResult> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    await convertToFullDiscovery(projectId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath("/dashboard/projects");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل التحويل إلى Full Discovery." };
  }
}
