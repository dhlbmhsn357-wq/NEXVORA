"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { listSectorStandards, getProjectStandardLink, markProjectAsSectorStandard } from "@/lib/sector-standards/service";
import { createClientVariant, type CloneOutcome } from "@/lib/sector-standards/clone-service";
import type { ProjectStandardLink, SectorStandardSummary } from "@/lib/sector-standards/types";

/**
 * Server Actions — Sector Standards + Client Variant Cloning (0123، المرحلة أ)
 * نفس نمط ActionResult في evaluation-actions.ts بالضبط.
 */
type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

// نفس رتبة الكتابة المستخدمة في باقي هذا الجلسة (owner/admin/supervisor) —
// وضع مشروع كـ Standard أو استنساخ Client Variant عملية بنيوية على مستوى
// المحفظة، مش لعمل member العادي.
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guardWrite() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

/** يعلّم مشروعًا كـ Sector Standard (owner/admin/supervisor فقط). */
export async function markAsSectorStandardAction(
  projectId: string,
  sectorName: string,
  standardVersion: string
): Promise<ActionResult> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    await markProjectAsSectorStandard(projectId, sectorName, standardVersion);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل تعليم المشروع كـ Sector Standard." };
  }
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/projects");
  return { ok: true };
}

/** ينشئ مشروع Client Variant عبر استنساخ Sector Standard (owner/admin/supervisor فقط). */
export async function createClientVariantAction(
  standardProjectId: string,
  clientId: string | null,
  clientProjectName: string
): Promise<ActionResult<CloneOutcome>> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    const outcome = await createClientVariant(standardProjectId, clientId, clientProjectName, g.userId);
    revalidatePath("/dashboard/projects");
    return { ok: true, data: outcome };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل إنشاء Client Variant." };
  }
}

/** قراءة — كل مشاريع Sector Standard. متاحة لأي دور مسجّل دخول (زي باقي القراءات في هذا الجلسة). */
export async function listSectorStandardsAction(): Promise<ActionResult<SectorStandardSummary[]>> {
  const g = await requireRole(["owner", "admin", "supervisor", "member"]);
  if (!g.ok) return { ok: false, message: g.message ?? "غير مصرَّح" };
  try {
    const data = await listSectorStandards();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب قائمة Sector Standards." };
  }
}

/** قراءة — رابط الاستنساخ لمشروع عميل معيّن (null لو مش Client Variant). */
export async function getProjectStandardLinkAction(clientProjectId: string): Promise<ActionResult<ProjectStandardLink | null>> {
  const g = await requireRole(["owner", "admin", "supervisor", "member"]);
  if (!g.ok) return { ok: false, message: g.message ?? "غير مصرَّح" };
  try {
    const data = await getProjectStandardLink(clientProjectId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب رابط الاستنساخ." };
  }
}
