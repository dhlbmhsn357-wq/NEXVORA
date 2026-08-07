"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createPartner, updatePartnerStatus, revokePartner,
  type PartnerInput,
} from "@/lib/handoff/service";
import {
  PARTNER_ROLES, PARTNER_STATUSES,
  type PartnerRole, type PartnerStatus,
} from "@/lib/handoff/types";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

const isRole = (x: string): x is PartnerRole => (PARTNER_ROLES as readonly string[]).includes(x);
const isStatus = (x: string): x is PartnerStatus => (PARTNER_STATUSES as readonly string[]).includes(x);

export async function createPartnerAction(projectId: string, raw: {
  name: string; email: string; organization?: string; role?: string;
  expiresInDays?: number | null; notes?: string;
}): Promise<Result<{ id: string; accessToken: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const name = raw.name?.trim();
  const email = raw.email?.trim();
  if (!name) return { ok: false, message: "الاسم مطلوب." };
  if (!email) return { ok: false, message: "البريد الإلكتروني مطلوب." };
  if (raw.role && !isRole(raw.role)) return { ok: false, message: "دور غير معروف." };
  const input: PartnerInput = {
    name, email,
    organization: raw.organization?.trim() ?? "",
    role: (raw.role as PartnerRole | undefined) ?? "viewer",
    expiresInDays: raw.expiresInDays ?? null,
    notes: raw.notes ?? "",
  };
  try {
    const row = await createPartner(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id, accessToken: row.accessToken } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الدعوة." }; }
}

export async function updatePartnerStatusAction(projectId: string, id: string, status: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  if (!isStatus(status)) return { ok: false, message: "حالة غير معروفة." };
  try {
    await updatePartnerStatus(id, status, g.userId, "");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function revokePartnerAction(projectId: string, id: string, reason: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await revokePartner(id, reason ?? "", g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإلغاء." }; }
}
