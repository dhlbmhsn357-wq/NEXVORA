"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createPackage, upsertItem, finalizePackage, setManualOverride, freezePackage,
  createQuestion, answerQuestion, updateQuestionStatus, getQuestion,
  createDelivery, updateDeliveryStatus,
  type HandoffItemPatch, type CreateQuestionInput, type CreateDeliveryInput,
} from "@/lib/handoff/service";
import {
  previewAssemblyForProject, applyAssemblyForProject,
  type AssemblyPreview, type AssemblyResult,
} from "@/lib/handoff/assembler";
import {
  HANDOFF_ITEM_STATUSES, HANDOFF_ITEM_REGISTRY,
  HANDOFF_QUESTION_STATUSES, HANDOFF_QUESTION_PRIORITIES,
  HANDOFF_DELIVERY_STATUSES, HANDOFF_DELIVERY_STATUS_LABELS,
  type HandoffItemStatus,
  type HandoffQuestionStatus, type HandoffQuestionPriority,
  type HandoffDeliveryStatus,
} from "@/lib/handoff/types";
import { NotificationService } from "@/lib/notifications/service";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

const isItemStatus = (x: string): x is HandoffItemStatus =>
  (HANDOFF_ITEM_STATUSES as readonly string[]).includes(x);
const KNOWN_KEYS = new Set(HANDOFF_ITEM_REGISTRY.map((d) => d.key));

export async function createPackageAction(projectId: string, title?: string): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  try {
    const row = await createPackage(projectId, title?.trim() || "Handoff Package", g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updateItemAction(projectId: string, packageId: string, itemKey: string, raw: {
  status?: string; contentUrl?: string | null; contentText?: string;
  contentRefType?: string | null; contentRefId?: string | null; notes?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  if (!itemKey || !KNOWN_KEYS.has(itemKey)) return { ok: false, message: "مفتاح العنصر غير معروف." };
  const patch: HandoffItemPatch = {};
  if (raw.status !== undefined) {
    if (!isItemStatus(raw.status)) return { ok: false, message: "حالة غير معروفة." };
    patch.status = raw.status;
  }
  if (raw.contentUrl !== undefined) patch.contentUrl = raw.contentUrl?.trim() || null;
  if (raw.contentText !== undefined) patch.contentText = raw.contentText;
  if (raw.contentRefType !== undefined) patch.contentRefType = raw.contentRefType;
  if (raw.contentRefId !== undefined) patch.contentRefId = raw.contentRefId;
  if (raw.notes !== undefined) patch.notes = raw.notes;
  try {
    const row = await upsertItem(packageId, projectId, itemKey, patch);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

// ============================================================================
// Auto-assembly (0110)
// ============================================================================
export async function previewAssemblyAction(
  projectId: string, packageId: string,
): Promise<Result<AssemblyPreview[]>> {
  const g = await guard(); if (!g.ok) return g;
  try {
    const previews = await previewAssemblyForProject(projectId, packageId);
    return { ok: true, data: previews };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحضير." }; }
}

export async function applyAssemblyAction(
  projectId: string, packageId: string,
): Promise<Result<AssemblyResult>> {
  const g = await guard(); if (!g.ok) return g;
  try {
    const res = await applyAssemblyForProject(projectId, packageId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: res };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التجميع." }; }
}

export async function manualOverrideItemAction(
  projectId: string, itemId: string, reason: string,
): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await setManualOverride(itemId, true, reason?.trim() ?? "");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function clearManualOverrideAction(
  projectId: string, itemId: string,
): Promise<Result> {
  const g = await requireRole(["owner", "admin"]);
  if (!g.ok) return { ok: false, message: g.message ?? "غير مصرَّح" };
  try {
    await setManualOverride(itemId, false, "");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function finalizePackageAction(projectId: string, packageId: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await finalizePackage(packageId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التسليم." }; }
}

/** 0110 — تسليم رسمي: يجمّد الحزمة في snapshot ثابت. */
export async function freezePackageAction(
  projectId: string, packageId: string,
): Promise<Result<{ snapshotId: string; version: number }>> {
  const g = await guard(); if (!g.ok) return g;
  try {
    const snap = await freezePackage(packageId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { snapshotId: snap.id, version: snap.version } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التجميد." }; }
}

// ============================================================================
// Handoff Questions (0107)
// ============================================================================
const isQStatus = (x: string): x is HandoffQuestionStatus =>
  (HANDOFF_QUESTION_STATUSES as readonly string[]).includes(x);
const isQPriority = (x: string): x is HandoffQuestionPriority =>
  (HANDOFF_QUESTION_PRIORITIES as readonly string[]).includes(x);
const isDStatus = (x: string): x is HandoffDeliveryStatus =>
  (HANDOFF_DELIVERY_STATUSES as readonly string[]).includes(x);

export async function createQuestionAction(
  projectId: string, packageId: string,
  raw: { question: string; partnerId?: string | null; priority?: string; assignedTo?: string | null },
): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const question = raw.question?.trim();
  if (!question) return { ok: false, message: "نص السؤال مطلوب." };
  const input: CreateQuestionInput = {
    projectId, packageId, question,
    partnerId: raw.partnerId || null,
    priority: raw.priority && isQPriority(raw.priority) ? raw.priority : "medium",
    assignedTo: raw.assignedTo || null,
  };
  try {
    const row = await createQuestion(input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function answerQuestionAction(
  projectId: string, id: string, answer: string,
): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  const a = answer?.trim();
  if (!a) return { ok: false, message: "الإجابة فارغة." };
  try {
    const before = await getQuestion(id);
    const row = await answerQuestion(id, a, g.userId);
    if (before?.askedBy && before.askedBy !== g.userId) {
      await NotificationService.emit({
        dedupeKey: `hq:${id}:answered`,
        type: "handoff_question_answered",
        title: "تمت الإجابة على سؤال",
        message: row.question.slice(0, 120),
        targetUrl: `/dashboard/projects/${projectId}?tab=handoff`,
        projectId,
        targetModule: "handoff_questions",
        targetRecordId: id,
      });
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإرسال." }; }
}

export async function updateQuestionStatusAction(
  projectId: string, id: string, status: string,
): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  if (!isQStatus(status)) return { ok: false, message: "حالة غير معروفة." };
  try {
    await updateQuestionStatus(id, status);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

// ============================================================================
// Handoff Deliveries (0107)
// ============================================================================
export async function createDeliveryAction(
  projectId: string, packageId: string,
  raw: { partnerId?: string | null; partnerName?: string; receiptStatus?: string; notes?: string },
): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const status = raw.receiptStatus && isDStatus(raw.receiptStatus) ? raw.receiptStatus : "pending";
  const input: CreateDeliveryInput = {
    projectId, packageId,
    partnerId: raw.partnerId || null,
    partnerName: raw.partnerName?.trim() ?? "",
    receiptStatus: status,
    notes: raw.notes ?? "",
  };
  try {
    const row = await createDelivery(input, g.userId);
    await NotificationService.emit({
      dedupeKey: `hd:${row.id}:status`,
      type: "handoff_delivery_status_changed",
      title: "تحديث تسليم حزمة",
      message: `الحالة: ${HANDOFF_DELIVERY_STATUS_LABELS[status]}`,
      targetUrl: `/dashboard/projects/${projectId}?tab=handoff`,
      projectId,
      targetModule: "handoff_deliveries",
      targetRecordId: row.id,
    });
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updateDeliveryStatusAction(
  projectId: string, id: string, status: string,
): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  if (!isDStatus(status)) return { ok: false, message: "حالة غير معروفة." };
  try {
    await updateDeliveryStatus(id, status, g.userId);
    await NotificationService.emit({
      dedupeKey: `hd:${id}:status`,
      type: "handoff_delivery_status_changed",
      title: "تحديث تسليم حزمة",
      message: `الحالة الآن: ${HANDOFF_DELIVERY_STATUS_LABELS[status]}`,
      targetUrl: `/dashboard/projects/${projectId}?tab=handoff`,
      projectId,
      targetModule: "handoff_deliveries",
      targetRecordId: id,
    });
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}
