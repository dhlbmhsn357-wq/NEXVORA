"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { runArchitectureValidation, getArchitectureReport } from "@/lib/architecture-validation/service";
import type { ArchitectureValidationReport } from "@/lib/types/database";

/** يشغّل التحقّق المعماري (قبل الـ PRD) ويعيد التقرير المحدّث. */
export async function runArchitectureValidationAction(projectId: string): Promise<{ ok: boolean; report?: ArchitectureValidationReport | null; message?: string }> {
  const auth = await requireRole(["supervisor", "admin", "owner"]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const res = await runArchitectureValidation(projectId, auth.userId ?? null);
  if (!res.ok) return { ok: false, message: res.message };
  const report = await getArchitectureReport(projectId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, report };
}
