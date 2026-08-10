"use server";

/**
 * NEXVORA User Stories + AC — Server Actions (P7)
 * ===============================================
 * كل التعديلات محمية بـ RBAC (owner + admin + supervisor).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createStory, updateStory, deleteStory,
  createAc, updateAc, deleteAc, nextAcOrderIndex,
  type StoryInput, type AcInput,
} from "@/lib/user-stories/service";
import { autoTriggerChangeImpact } from "@/lib/change-impact/auto-trigger";
import { createServiceClient } from "@/lib/supabase/service";
import {
  STORY_STATUSES, RISK_LEVELS, AC_STATUSES,
  type StoryStatus, type RiskLevel, type AcStatus,
} from "@/lib/user-stories/types";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const gate = await requireRole([...WRITE_ROLES]);
  if (!gate.ok) return { ok: false as const, message: gate.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: gate.userId ?? null };
}

const isStoryStatus = (x: string): x is StoryStatus => (STORY_STATUSES as readonly string[]).includes(x);
const isRisk = (x: string): x is RiskLevel => (RISK_LEVELS as readonly string[]).includes(x);
const isAcStatus = (x: string): x is AcStatus => (AC_STATUSES as readonly string[]).includes(x);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
}
function parseAndConditions(raw: string | undefined): string[] {
  if (!raw) return [];
  // كل سطر شرط منفصل
  return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------
export async function createStoryAction(
  projectId: string,
  raw: {
    code?: string; title: string; asA?: string; iWant?: string; soThat?: string;
    narrativeExtra?: string; status?: string; storyPoints?: number | string | null;
    businessValue?: number | string; riskLevel?: string;
    linkedPersonaId?: string | null; linkedFlowId?: string | null; linkedRequirementId?: string | null;
    tags?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };

  let storyPoints: number | null = null;
  if (raw.storyPoints !== undefined && raw.storyPoints !== "" && raw.storyPoints !== null) {
    const n = Number(raw.storyPoints);
    if (Number.isNaN(n) || n < 0) return { ok: false, message: "نقاط القصة رقم غير صحيح." };
    storyPoints = Math.round(n);
  }
  const bv = raw.businessValue == null || raw.businessValue === "" ? 50 : Number(raw.businessValue);
  if (Number.isNaN(bv)) return { ok: false, message: "قيمة العمل رقم غير صحيح." };

  const input: StoryInput = {
    code: raw.code?.trim() || null, title,
    asA: raw.asA ?? "", iWant: raw.iWant ?? "", soThat: raw.soThat ?? "",
    narrativeExtra: raw.narrativeExtra ?? "",
    status: raw.status && isStoryStatus(raw.status) ? raw.status : "draft",
    storyPoints,
    businessValue: clamp(Math.round(bv), 0, 100),
    riskLevel: raw.riskLevel && isRisk(raw.riskLevel) ? raw.riskLevel : "medium",
    linkedPersonaId: raw.linkedPersonaId || null,
    linkedFlowId: raw.linkedFlowId || null,
    linkedRequirementId: raw.linkedRequirementId || null,
    tags: parseTags(raw.tags),
  };
  try {
    const row = await createStory(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateStoryAction(
  projectId: string, id: string,
  patch: Partial<{ code: string; title: string; asA: string; iWant: string; soThat: string; narrativeExtra: string; status: string; storyPoints: number | string | null; businessValue: number | string; riskLevel: string; linkedPersonaId: string | null; linkedFlowId: string | null; linkedRequirementId: string | null; tags: string; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<StoryInput> = {};
  if (patch.code !== undefined) clean.code = patch.code?.trim() || null;
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.asA !== undefined) clean.asA = patch.asA;
  if (patch.iWant !== undefined) clean.iWant = patch.iWant;
  if (patch.soThat !== undefined) clean.soThat = patch.soThat;
  if (patch.narrativeExtra !== undefined) clean.narrativeExtra = patch.narrativeExtra;
  if (patch.status !== undefined) {
    if (!isStoryStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.storyPoints !== undefined) {
    if (patch.storyPoints === null || patch.storyPoints === "") clean.storyPoints = null;
    else {
      const n = Number(patch.storyPoints);
      if (Number.isNaN(n) || n < 0) return { ok: false, message: "قيمة غير صحيحة." };
      clean.storyPoints = Math.round(n);
    }
  }
  if (patch.businessValue !== undefined) {
    const n = Number(patch.businessValue);
    if (Number.isNaN(n)) return { ok: false, message: "قيمة غير صحيحة." };
    clean.businessValue = clamp(Math.round(n), 0, 100);
  }
  if (patch.riskLevel !== undefined) {
    if (!isRisk(patch.riskLevel)) return { ok: false, message: "مستوى مخاطر غير معروف." };
    clean.riskLevel = patch.riskLevel;
  }
  if (patch.linkedPersonaId !== undefined) clean.linkedPersonaId = patch.linkedPersonaId;
  if (patch.linkedFlowId !== undefined) clean.linkedFlowId = patch.linkedFlowId;
  if (patch.linkedRequirementId !== undefined) clean.linkedRequirementId = patch.linkedRequirementId;
  if (patch.tags !== undefined) clean.tags = parseTags(patch.tags);
  try {
    const svc = createServiceClient();
    const { data: beforeRow } = await svc
      .from("user_stories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    await updateStory(id, clean);
    const { data: afterRow } = await svc
      .from("user_stories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (beforeRow && afterRow && String(beforeRow.status) === "approved") {
      try {
        await autoTriggerChangeImpact({
          table: "user_stories",
          projectId,
          sourceId: id,
          before: beforeRow as Record<string, unknown>,
          after: afterRow as Record<string, unknown>,
          actorId: g.userId,
        });
      } catch (err) {
        console.error("[updateStoryAction] autoTriggerChangeImpact failed:", err instanceof Error ? err.message : err);
      }
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteStoryAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteStory(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// Acceptance Criteria
// ---------------------------------------------------------------------------
export async function createAcAction(
  projectId: string,
  raw: {
    userStoryId: string; title?: string;
    givenClause?: string; whenClause?: string; thenClause?: string;
    andConditions?: string; status?: string; notes?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!raw.userStoryId) return { ok: false, message: "القصة مطلوبة." };
  let orderIndex = 1;
  try {
    orderIndex = await nextAcOrderIndex(raw.userStoryId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل قراءة الترقيم." };
  }
  const input: AcInput = {
    userStoryId: raw.userStoryId,
    orderIndex,
    title: raw.title ?? "",
    givenClause: raw.givenClause ?? "",
    whenClause: raw.whenClause ?? "",
    thenClause: raw.thenClause ?? "",
    andConditions: parseAndConditions(raw.andConditions),
    status: raw.status && isAcStatus(raw.status) ? raw.status : "draft",
    notes: raw.notes ?? "",
  };
  try {
    const row = await createAc(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateAcAction(
  projectId: string, id: string,
  patch: Partial<{ title: string; givenClause: string; whenClause: string; thenClause: string; andConditions: string; status: string; notes: string; orderIndex: number | string; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<Omit<AcInput, "userStoryId">> = {};
  if (patch.title !== undefined) clean.title = patch.title;
  if (patch.givenClause !== undefined) clean.givenClause = patch.givenClause;
  if (patch.whenClause !== undefined) clean.whenClause = patch.whenClause;
  if (patch.thenClause !== undefined) clean.thenClause = patch.thenClause;
  if (patch.andConditions !== undefined) clean.andConditions = parseAndConditions(patch.andConditions);
  if (patch.status !== undefined) {
    if (!isAcStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.notes !== undefined) clean.notes = patch.notes;
  if (patch.orderIndex !== undefined) {
    const n = Number(patch.orderIndex);
    if (!Number.isInteger(n) || n < 1) return { ok: false, message: "ترتيب غير صحيح." };
    clean.orderIndex = n;
  }
  try {
    const svc = createServiceClient();
    const { data: beforeRow } = await svc
      .from("acceptance_criteria")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    await updateAc(id, clean);
    const { data: afterRow } = await svc
      .from("acceptance_criteria")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const wasApproved =
      beforeRow && (String(beforeRow.status) === "approved" || String(beforeRow.status) === "verified");
    if (beforeRow && afterRow && wasApproved) {
      try {
        await autoTriggerChangeImpact({
          table: "acceptance_criteria",
          projectId,
          sourceId: id,
          before: beforeRow as Record<string, unknown>,
          after: afterRow as Record<string, unknown>,
          actorId: g.userId,
        });
      } catch (err) {
        console.error("[updateAcAction] autoTriggerChangeImpact failed:", err instanceof Error ? err.message : err);
      }
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteAcAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteAc(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}
