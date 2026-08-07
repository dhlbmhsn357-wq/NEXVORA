"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createPackage, upsertItem, finalizePackage,
  type HandoffItemPatch,
} from "@/lib/handoff/service";
import {
  HANDOFF_ITEM_STATUSES, HANDOFF_ITEM_REGISTRY,
  type HandoffItemStatus,
} from "@/lib/handoff/types";

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

export async function finalizePackageAction(projectId: string, packageId: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await finalizePackage(packageId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التسليم." }; }
}
