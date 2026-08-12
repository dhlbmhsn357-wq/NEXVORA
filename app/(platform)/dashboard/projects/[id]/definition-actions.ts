"use server";

/**
 * NEXVORA Product Definition — Server Actions (P6)
 * =================================================
 * كل التعديلات محمية بـ RBAC (owner + admin + supervisor).
 * القراءة عبر RLS للمستخدمين المسجّلين.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createPersona, updatePersona, deletePersona,
  createFlow, updateFlow, deleteFlow,
  createRequirement, updateRequirement, deleteRequirement,
  type PersonaInput, type FlowInput, type RequirementInput,
} from "@/lib/product-definition/service";
import { autoTriggerChangeImpact } from "@/lib/change-impact/auto-trigger";
import { createServiceClient } from "@/lib/supabase/service";
import {
  FLOW_TYPES, MOSCOW_PRIORITIES, REQUIREMENT_STATUSES, REQUIREMENT_TYPES,
  type FlowType, type MoscowPriority, type RequirementStatus, type RequirementType, type FlowStep,
} from "@/lib/product-definition/types";
import {
  planImportFromBrain, applyImportFromBrain,
  type BrainImportPlan,
} from "@/lib/product-definition/import-from-brain";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const gate = await requireRole([...WRITE_ROLES]);
  if (!gate.ok) return { ok: false as const, message: gate.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: gate.userId ?? null };
}

const isFlowType = (x: string): x is FlowType => (FLOW_TYPES as readonly string[]).includes(x);
const isMoscow = (x: string): x is MoscowPriority => (MOSCOW_PRIORITIES as readonly string[]).includes(x);
const isReqStatus = (x: string): x is RequirementStatus => (REQUIREMENT_STATUSES as readonly string[]).includes(x);
const isReqType = (x: string): x is RequirementType => (REQUIREMENT_TYPES as readonly string[]).includes(x);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
}
function parseChannels(raw: string | undefined): string[] {
  return parseTags(raw);
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export async function createPersonaAction(
  projectId: string,
  raw: {
    name: string; role?: string; segment?: string; jobsToBeDone?: string;
    goals?: string; pains?: string; channels?: string; techSavviness?: number | string;
    notes?: string; isPrimary?: boolean;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const name = raw.name?.trim();
  if (!name) return { ok: false, message: "الاسم مطلوب." };
  const tech = raw.techSavviness == null || raw.techSavviness === "" ? 50 : Number(raw.techSavviness);
  if (Number.isNaN(tech)) return { ok: false, message: "المستوى التقني رقم غير صحيح." };

  const input: PersonaInput = {
    name, role: raw.role ?? "", segment: raw.segment ?? "",
    jobsToBeDone: raw.jobsToBeDone ?? "", goals: raw.goals ?? "", pains: raw.pains ?? "",
    channels: parseChannels(raw.channels), techSavviness: clamp(Math.round(tech), 0, 100),
    notes: raw.notes ?? "", isPrimary: !!raw.isPrimary,
  };
  try {
    const row = await createPersona(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updatePersonaAction(
  projectId: string, id: string,
  patch: Partial<{ name: string; role: string; segment: string; jobsToBeDone: string; goals: string; pains: string; channels: string; techSavviness: number | string; notes: string; isPrimary: boolean; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<PersonaInput> = {};
  if (patch.name !== undefined) {
    const t = patch.name.trim(); if (!t) return { ok: false, message: "الاسم مطلوب." };
    clean.name = t;
  }
  if (patch.role !== undefined) clean.role = patch.role;
  if (patch.segment !== undefined) clean.segment = patch.segment;
  if (patch.jobsToBeDone !== undefined) clean.jobsToBeDone = patch.jobsToBeDone;
  if (patch.goals !== undefined) clean.goals = patch.goals;
  if (patch.pains !== undefined) clean.pains = patch.pains;
  if (patch.channels !== undefined) clean.channels = parseChannels(patch.channels);
  if (patch.techSavviness !== undefined) {
    const n = Number(patch.techSavviness);
    if (Number.isNaN(n)) return { ok: false, message: "قيمة غير صحيحة." };
    clean.techSavviness = clamp(Math.round(n), 0, 100);
  }
  if (patch.notes !== undefined) clean.notes = patch.notes;
  if (patch.isPrimary !== undefined) clean.isPrimary = patch.isPrimary;
  try {
    await updatePersona(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deletePersonaAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deletePersona(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// User Flows
// ---------------------------------------------------------------------------
function sanitizeSteps(raw: unknown): FlowStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, idx): FlowStep | null => {
      if (!s || typeof s !== "object") return null;
      const obj = s as Record<string, unknown>;
      const action = String(obj.action ?? "").trim();
      if (!action) return null;
      return {
        order: typeof obj.order === "number" ? obj.order : idx + 1,
        action,
        expectedResult: String(obj.expectedResult ?? "").trim(),
        notes: String(obj.notes ?? "").trim(),
      };
    })
    .filter((s): s is FlowStep => s !== null);
}

export async function createFlowAction(
  projectId: string,
  raw: {
    personaId?: string | null; name: string; description?: string;
    flowType?: string; triggerEvent?: string; successOutcome?: string;
    steps?: unknown; notes?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const name = raw.name?.trim();
  if (!name) return { ok: false, message: "الاسم مطلوب." };
  const flowType = raw.flowType && isFlowType(raw.flowType) ? raw.flowType : "primary";
  const input: FlowInput = {
    personaId: raw.personaId || null, name,
    description: raw.description ?? "", flowType,
    triggerEvent: raw.triggerEvent ?? "", successOutcome: raw.successOutcome ?? "",
    steps: sanitizeSteps(raw.steps), notes: raw.notes ?? "",
  };
  try {
    const row = await createFlow(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateFlowAction(
  projectId: string, id: string,
  patch: Partial<{ personaId: string | null; name: string; description: string; flowType: string; triggerEvent: string; successOutcome: string; steps: unknown; notes: string; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<FlowInput> = {};
  if (patch.personaId !== undefined) clean.personaId = patch.personaId;
  if (patch.name !== undefined) {
    const t = patch.name.trim(); if (!t) return { ok: false, message: "الاسم مطلوب." };
    clean.name = t;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.flowType !== undefined) {
    if (!isFlowType(patch.flowType)) return { ok: false, message: "نوع غير معروف." };
    clean.flowType = patch.flowType;
  }
  if (patch.triggerEvent !== undefined) clean.triggerEvent = patch.triggerEvent;
  if (patch.successOutcome !== undefined) clean.successOutcome = patch.successOutcome;
  if (patch.steps !== undefined) clean.steps = sanitizeSteps(patch.steps);
  if (patch.notes !== undefined) clean.notes = patch.notes;
  try {
    await updateFlow(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteFlowAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteFlow(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
export async function createRequirementAction(
  projectId: string,
  raw: {
    code?: string; title: string; description?: string;
    requirementType?: string; priority?: string; status?: string;
    rationale?: string; acceptanceHint?: string; effortEstimate?: string;
    linkedPersonaId?: string | null; linkedFlowId?: string | null; tags?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  const input: RequirementInput = {
    code: raw.code?.trim() || null,
    title,
    description: raw.description ?? "",
    requirementType: raw.requirementType && isReqType(raw.requirementType) ? raw.requirementType : "functional",
    priority: raw.priority && isMoscow(raw.priority) ? raw.priority : "should",
    status: raw.status && isReqStatus(raw.status) ? raw.status : "draft",
    rationale: raw.rationale ?? "", acceptanceHint: raw.acceptanceHint ?? "",
    effortEstimate: raw.effortEstimate ?? "",
    linkedPersonaId: raw.linkedPersonaId || null,
    linkedFlowId: raw.linkedFlowId || null,
    tags: parseTags(raw.tags),
  };
  try {
    const row = await createRequirement(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateRequirementAction(
  projectId: string, id: string,
  patch: Partial<{ code: string; title: string; description: string; requirementType: string; priority: string; status: string; rationale: string; acceptanceHint: string; effortEstimate: string; linkedPersonaId: string | null; linkedFlowId: string | null; tags: string; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<RequirementInput> = {};
  if (patch.code !== undefined) clean.code = patch.code?.trim() || null;
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.requirementType !== undefined) {
    if (!isReqType(patch.requirementType)) return { ok: false, message: "نوع غير معروف." };
    clean.requirementType = patch.requirementType;
  }
  if (patch.priority !== undefined) {
    if (!isMoscow(patch.priority)) return { ok: false, message: "أولوية غير معروفة." };
    clean.priority = patch.priority;
  }
  if (patch.status !== undefined) {
    if (!isReqStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.rationale !== undefined) clean.rationale = patch.rationale;
  if (patch.acceptanceHint !== undefined) clean.acceptanceHint = patch.acceptanceHint;
  if (patch.effortEstimate !== undefined) clean.effortEstimate = patch.effortEstimate;
  if (patch.linkedPersonaId !== undefined) clean.linkedPersonaId = patch.linkedPersonaId;
  if (patch.linkedFlowId !== undefined) clean.linkedFlowId = patch.linkedFlowId;
  if (patch.tags !== undefined) clean.tags = parseTags(patch.tags);
  try {
    // اقرأ الـ "before" مباشرة من الجدول (لأن الـ service ما فيهاش getRequirement)
    // — نستخدمه للـ material-change detection في autoTriggerChangeImpact.
    const svc = createServiceClient();
    const { data: beforeRow } = await svc
      .from("product_requirements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    await updateRequirement(id, clean);
    const { data: afterRow } = await svc
      .from("product_requirements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    // Fire-and-forget — لا يجب أن يعطّل التحديث الأصلي لو فشل.
    if (beforeRow && afterRow && String(beforeRow.status) === "approved") {
      try {
        await autoTriggerChangeImpact({
          table: "product_requirements",
          projectId,
          sourceId: id,
          before: beforeRow as Record<string, unknown>,
          after: afterRow as Record<string, unknown>,
          actorId: g.userId,
        });
      } catch (err) {
        console.error("[updateRequirementAction] autoTriggerChangeImpact failed:", err instanceof Error ? err.message : err);
      }
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteRequirementAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteRequirement(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// Import from Project Brain (approved stakeholders → personas,
// functional/non_functional requirements → requirements)
// ---------------------------------------------------------------------------
export async function planImportFromBrainAction(projectId: string): Promise<ActionResult<BrainImportPlan>> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    const plan = await planImportFromBrain(projectId);
    return { ok: true, data: plan };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل بناء خطة الاستيراد." };
  }
}

export async function applyImportFromBrainAction(
  projectId: string,
): Promise<ActionResult<{ personasCreated: number; requirementsCreated: number }>> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    const res = await applyImportFromBrain(projectId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الاستيراد." };
  }
}
