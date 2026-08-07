"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createApproval, revokeApproval, recordDecision, logAudit, getApprovalByToken,
  type ApprovalInput,
} from "@/lib/client-approval/service";
import {
  APPROVAL_TARGET_TYPES, APPROVAL_DECISIONS,
  type ApprovalTargetType, type ApprovalDecision,
} from "@/lib/client-approval/types";
import { effectiveStatus } from "@/lib/client-approval/derive";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

const isTargetType = (x: string): x is ApprovalTargetType =>
  (APPROVAL_TARGET_TYPES as readonly string[]).includes(x);
const isDecision = (x: string): x is ApprovalDecision =>
  (APPROVAL_DECISIONS as readonly string[]).includes(x);

export async function createApprovalAction(projectId: string, raw: {
  targetType: string; targetId?: string | null; targetVersion?: number | null;
  title: string; summary?: string; clientName?: string; clientEmail?: string;
  expiresInDays?: number;
}): Promise<Result<{ id: string; publicToken: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  if (!isTargetType(raw.targetType)) return { ok: false, message: "نوع الهدف غير معروف." };
  const input: ApprovalInput = {
    targetType: raw.targetType,
    targetId: raw.targetId ?? null,
    targetVersion: raw.targetVersion ?? null,
    title,
    summary: raw.summary ?? "",
    clientName: raw.clientName ?? "",
    clientEmail: raw.clientEmail ?? "",
    expiresInDays: typeof raw.expiresInDays === "number" && raw.expiresInDays > 0 ? raw.expiresInDays : 14,
  };
  try {
    const row = await createApproval(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id, publicToken: row.publicToken } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function revokeApprovalAction(projectId: string, id: string, reason: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await revokeApproval(id, reason ?? "", g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإلغاء." }; }
}

/**
 * قرار العميل — عام (بدون تسجيل دخول). يتحقّق من الحالة الفعّالة قبل الحفظ.
 */
export async function recordDecisionAction(token: string, raw: {
  decision: string; note?: string; actor?: string;
}): Promise<Result<{ id: string }>> {
  if (!token) return { ok: false, message: "رمز الوصول مفقود." };
  if (!isDecision(raw.decision)) return { ok: false, message: "قرار غير معروف." };
  try {
    const row = await getApprovalByToken(token);
    if (!row) return { ok: false, message: "لا يوجد رابط بهذا الرمز." };
    const now = new Date().toISOString();
    const eff = effectiveStatus(row, now);
    if (eff !== "pending") {
      return { ok: false, message: eff === "expired" ? "الرابط منتهي الصلاحية." : eff === "revoked" ? "الرابط ملغى." : "تم اتخاذ القرار سابقًا." };
    }
    const updated = await recordDecision(row.id, raw.decision, raw.note ?? "", raw.actor?.trim() || row.clientName || "client");
    return { ok: true, data: { id: updated.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل تسجيل القرار." }; }
}

/** يُستخدم عند عرض صفحة /approve/[token] لتسجيل مشاهدة. عام. */
export async function logApprovalViewedAction(token: string, meta: Record<string, unknown> = {}): Promise<Result> {
  try {
    const row = await getApprovalByToken(token);
    if (!row) return { ok: false, message: "لا يوجد رابط." };
    await logAudit(row.id, row.projectId, "viewed", meta, row.clientName || "client");
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التسجيل." }; }
}
