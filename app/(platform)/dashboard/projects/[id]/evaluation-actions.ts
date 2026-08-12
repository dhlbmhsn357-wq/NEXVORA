"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createScenario, updateScenario, deleteScenario,
  approveScenario, approveDraftScenarios,
  createRun, deleteRun,
  type ScenarioInput, type RunInput,
} from "@/lib/evaluation/service";
import {
  EVAL_CATEGORIES, EVAL_SEVERITIES, EVAL_RUN_RESULTS,
  type EvalCategory, type EvalSeverity, type EvalRunResult, type EvalStep,
} from "@/lib/evaluation/types";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

const isCat = (x: string): x is EvalCategory => (EVAL_CATEGORIES as readonly string[]).includes(x);
const isSev = (x: string): x is EvalSeverity => (EVAL_SEVERITIES as readonly string[]).includes(x);
const isResult = (x: string): x is EvalRunResult => (EVAL_RUN_RESULTS as readonly string[]).includes(x);

function parseTags(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
}
function sanitizeSteps(raw: unknown): EvalStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i): EvalStep | null => {
    if (!s || typeof s !== "object") return null;
    const o = s as Record<string, unknown>;
    const action = String(o.action ?? "").trim();
    if (!action) return null;
    return { order: typeof o.order === "number" ? o.order : i + 1, action };
  }).filter((s): s is EvalStep => s !== null);
}

// ---------- Scenarios ----------
export async function createScenarioAction(projectId: string, raw: {
  code?: string; title: string; description?: string; category?: string; severity?: string;
  preconditions?: string; steps?: unknown; expectedResult?: string;
  linkedStoryId?: string | null; linkedFlowId?: string | null; tags?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  const input: ScenarioInput = {
    code: raw.code?.trim() || null, title, description: raw.description ?? "",
    category: raw.category && isCat(raw.category) ? raw.category : "functional",
    severity: raw.severity && isSev(raw.severity) ? raw.severity : "medium",
    preconditions: raw.preconditions ?? "",
    steps: sanitizeSteps(raw.steps), expectedResult: raw.expectedResult ?? "",
    linkedStoryId: raw.linkedStoryId || null, linkedFlowId: raw.linkedFlowId || null,
    tags: parseTags(raw.tags),
  };
  try {
    const row = await createScenario(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updateScenarioAction(projectId: string, id: string, patch: Partial<{
  code: string; title: string; description: string; category: string; severity: string;
  preconditions: string; steps: unknown; expectedResult: string;
  linkedStoryId: string | null; linkedFlowId: string | null; tags: string;
}>): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  const clean: Partial<ScenarioInput> = {};
  if (patch.code !== undefined) clean.code = patch.code?.trim() || null;
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.category !== undefined) {
    if (!isCat(patch.category)) return { ok: false, message: "فئة غير معروفة." };
    clean.category = patch.category;
  }
  if (patch.severity !== undefined) {
    if (!isSev(patch.severity)) return { ok: false, message: "خطورة غير معروفة." };
    clean.severity = patch.severity;
  }
  if (patch.preconditions !== undefined) clean.preconditions = patch.preconditions;
  if (patch.steps !== undefined) clean.steps = sanitizeSteps(patch.steps);
  if (patch.expectedResult !== undefined) clean.expectedResult = patch.expectedResult;
  if (patch.linkedStoryId !== undefined) clean.linkedStoryId = patch.linkedStoryId;
  if (patch.linkedFlowId !== undefined) clean.linkedFlowId = patch.linkedFlowId;
  if (patch.tags !== undefined) clean.tags = parseTags(patch.tags);
  try {
    await updateScenario(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

/**
 * اعتماد سيناريو واحد. Idempotent — الاعتماد الثاني يمرّ بلا تغيير.
 */
export async function approveScenarioAction(
  scenarioId: string, projectId: string,
): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await approveScenario(scenarioId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الاعتماد." }; }
}

/**
 * اعتماد كل مسودات المشروع. يعيد عدد الصفوف اللي اتحدّثت فعليًا.
 */
export async function approveAllDraftScenariosAction(
  projectId: string,
): Promise<Result<{ approved: number }>> {
  const g = await guard(); if (!g.ok) return g;
  try {
    const approved = await approveDraftScenarios(projectId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { approved } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الاعتماد الجماعي." }; }
}

export async function deleteScenarioAction(projectId: string, id: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deleteScenario(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}

// ---------- Runs ----------
export async function recordRunAction(projectId: string, raw: {
  scenarioId: string; result: string; actualResult?: string; environment?: string; notes?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  if (!raw.scenarioId) return { ok: false, message: "السيناريو مطلوب." };
  if (!isResult(raw.result)) return { ok: false, message: "النتيجة غير معروفة." };
  const input: RunInput = {
    scenarioId: raw.scenarioId, result: raw.result,
    actualResult: raw.actualResult ?? "", environment: raw.environment ?? "", notes: raw.notes ?? "",
  };
  try {
    const row = await createRun(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التسجيل." }; }
}

export async function deleteRunAction(projectId: string, id: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deleteRun(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}
