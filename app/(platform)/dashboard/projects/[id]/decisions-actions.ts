"use server";

/**
 * NEXVORA Product Decisions Register — Server Actions (0107)
 * كل التعديلات محمية بـ requireRole(owner/admin/supervisor).
 * إشعارات:
 *   • change status → NotificationService.emit للـ owner (لو موجود)
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createItem, updateItem, deleteItem, setStatus, assign, link, getItem,
  type CreateItemInput, type UpdateItemPatch,
} from "@/lib/product-decisions/service";
import {
  ITEM_TYPES, ITEM_STATUSES, ITEM_PRIORITIES,
  ITEM_STATUS_LABELS, ITEM_TYPE_LABELS,
  type ItemType, type ItemStatus, type ItemPriority,
} from "@/lib/product-decisions/types";
import { NotificationService } from "@/lib/notifications/service";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

const isItemType = (x: string): x is ItemType => (ITEM_TYPES as readonly string[]).includes(x);
const isItemStatus = (x: string): x is ItemStatus => (ITEM_STATUSES as readonly string[]).includes(x);
const isItemPriority = (x: string): x is ItemPriority => (ITEM_PRIORITIES as readonly string[]).includes(x);

export async function createDecisionItemAction(
  projectId: string,
  raw: {
    itemType: string;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    ownerId?: string | null;
    dueDate?: string | null;
    impact?: string;
    mitigation?: string;
    resolution?: string;
    decisionDate?: string | null;
    linkedRequirementId?: string | null;
    linkedStoryId?: string | null;
    stageKey?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  if (!isItemType(raw.itemType)) return { ok: false, message: "نوع العنصر غير معروف." };
  const input: CreateItemInput = {
    itemType: raw.itemType,
    title,
    description: raw.description ?? "",
    status: raw.status && isItemStatus(raw.status) ? raw.status : "open",
    priority: raw.priority && isItemPriority(raw.priority) ? raw.priority : "medium",
    ownerId: raw.ownerId || null,
    dueDate: raw.dueDate || null,
    impact: raw.impact ?? "",
    mitigation: raw.mitigation ?? "",
    resolution: raw.resolution ?? "",
    decisionDate: raw.decisionDate || null,
    linkedRequirementId: raw.linkedRequirementId || null,
    linkedStoryId: raw.linkedStoryId || null,
    stageKey: raw.stageKey || null,
  };
  try {
    const row = await createItem(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updateDecisionItemAction(
  projectId: string, id: string,
  patch: {
    title?: string; description?: string; status?: string; priority?: string;
    ownerId?: string | null; dueDate?: string | null; impact?: string;
    mitigation?: string; resolution?: string; decisionDate?: string | null;
    linkedRequirementId?: string | null; linkedStoryId?: string | null; stageKey?: string | null;
  },
): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  const clean: UpdateItemPatch = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.status !== undefined) {
    if (!isItemStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.priority !== undefined) {
    if (!isItemPriority(patch.priority)) return { ok: false, message: "أولوية غير معروفة." };
    clean.priority = patch.priority;
  }
  if (patch.ownerId !== undefined) clean.ownerId = patch.ownerId || null;
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate || null;
  if (patch.impact !== undefined) clean.impact = patch.impact;
  if (patch.mitigation !== undefined) clean.mitigation = patch.mitigation;
  if (patch.resolution !== undefined) clean.resolution = patch.resolution;
  if (patch.decisionDate !== undefined) clean.decisionDate = patch.decisionDate || null;
  if (patch.linkedRequirementId !== undefined) clean.linkedRequirementId = patch.linkedRequirementId || null;
  if (patch.linkedStoryId !== undefined) clean.linkedStoryId = patch.linkedStoryId || null;
  if (patch.stageKey !== undefined) clean.stageKey = patch.stageKey || null;
  try {
    await updateItem(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function deleteDecisionItemAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deleteItem(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}

export async function setDecisionStatusAction(
  projectId: string, id: string, status: string,
): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  if (!isItemStatus(status)) return { ok: false, message: "حالة غير معروفة." };
  try {
    const before = await getItem(id);
    const row = await setStatus(id, status);
    // Notification: نُبلّغ owner العنصر (لو معيّن) بتغيّر الحالة.
    if (row.ownerId && before?.status !== status) {
      await NotificationService.emit({
        dedupeKey: `decision:${id}:status`,
        type: "product_decision_status_changed",
        category: "product",
        title: `تحديث حالة ${ITEM_TYPE_LABELS[row.itemType]}: ${row.title}`,
        message: `الحالة الآن: ${ITEM_STATUS_LABELS[status]}`,
        targetUrl: `/dashboard/projects/${projectId}?tab=decisions`,
        projectId,
        targetModule: "product_decisions",
        targetRecordId: id,
      });
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function assignDecisionItemAction(
  projectId: string, id: string, ownerId: string | null,
): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await assign(id, ownerId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التعيين." }; }
}

export async function linkDecisionItemAction(
  projectId: string, id: string,
  target: { requirementId?: string | null; storyId?: string | null; scopeItemId?: string | null },
): Promise<ActionResult> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await link(id, target);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الربط." }; }
}
