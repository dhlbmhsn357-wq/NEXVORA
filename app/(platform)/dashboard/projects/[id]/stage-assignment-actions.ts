"use server";

/**
 * NEXVORA Stage Assignments — Server Actions (0107)
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  upsertAssignment, setStatus,
  type StageAssignmentPatch,
} from "@/lib/stage-assignments/service";
import {
  STAGE_KEYS, STAGE_KEY_LABELS,
  STAGE_ASSIGNMENT_STATUSES, STAGE_ASSIGNMENT_STATUS_LABELS,
  type StageKey, type StageAssignmentStatus,
} from "@/lib/stage-assignments/types";
import { NotificationService } from "@/lib/notifications/service";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

const isStageKey = (x: string): x is StageKey => (STAGE_KEYS as readonly string[]).includes(x);
const isStatus = (x: string): x is StageAssignmentStatus =>
  (STAGE_ASSIGNMENT_STATUSES as readonly string[]).includes(x);

export async function upsertStageAssignmentAction(
  projectId: string, stageKey: string,
  patch: {
    ownerId?: string | null; reviewerId?: string | null;
    dueDate?: string | null; status?: string; notes?: string;
  },
): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  if (!isStageKey(stageKey)) return { ok: false, message: "مرحلة غير معروفة." };
  const clean: StageAssignmentPatch = {};
  if (patch.ownerId !== undefined) clean.ownerId = patch.ownerId || null;
  if (patch.reviewerId !== undefined) clean.reviewerId = patch.reviewerId || null;
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate || null;
  if (patch.status !== undefined) {
    if (!isStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.notes !== undefined) clean.notes = patch.notes;
  try {
    const row = await upsertAssignment(projectId, stageKey, clean);
    // Notification لكل من owner و reviewer (لو متعيّنين وتغيّروا).
    const stageLabel = STAGE_KEY_LABELS[stageKey];
    if (row.ownerId) {
      await NotificationService.emit({
        dedupeKey: `stage_assign:${projectId}:${stageKey}:owner`,
        type: "stage_owner_assigned",
        title: `مسؤولية مرحلة: ${stageLabel}`,
        message: `تم تعيينك مسؤولًا لمرحلة ${stageLabel}.`,
        targetUrl: `/dashboard/projects/${projectId}?tab=stageOwners`,
        projectId,
        targetModule: "stage_assignments",
      });
    }
    if (row.reviewerId) {
      await NotificationService.emit({
        dedupeKey: `stage_assign:${projectId}:${stageKey}:reviewer`,
        type: "stage_reviewer_assigned",
        title: `مراجعة مرحلة: ${stageLabel}`,
        message: `تم تعيينك مراجعًا لمرحلة ${stageLabel}.`,
        targetUrl: `/dashboard/projects/${projectId}?tab=stageOwners`,
        projectId,
        targetModule: "stage_assignments",
      });
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحفظ." }; }
}

export async function setStageStatusAction(
  projectId: string, stageKey: string, status: string,
): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  if (!isStageKey(stageKey)) return { ok: false, message: "مرحلة غير معروفة." };
  if (!isStatus(status)) return { ok: false, message: "حالة غير معروفة." };
  try {
    await setStatus(projectId, stageKey, status);
    // ملاحظة: نستخدم dedupe key ثابت هنا (بلا suffix حالة) عشان الإشعار
    // يتحدّث بدل ما يتراكم على كل تغيير حالة.
    await NotificationService.emit({
      dedupeKey: `stage_assign:${projectId}:${stageKey}:status`,
      type: "stage_status_changed",
      title: `تحديث حالة مرحلة ${STAGE_KEY_LABELS[stageKey]}`,
      message: `الحالة الآن: ${STAGE_ASSIGNMENT_STATUS_LABELS[status]}`,
      targetUrl: `/dashboard/projects/${projectId}?tab=stageOwners`,
      projectId,
      targetModule: "stage_assignments",
    });
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}
