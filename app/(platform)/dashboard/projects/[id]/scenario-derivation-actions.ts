"use server";

/**
 * NEXVORA Scenario Derivation — Server Actions
 * ============================================
 * Thin wrapper حول `lib/scenario-derivation/service.ts`. لا يحمل منطقًا خاصًا
 * — فقط RBAC (owner + admin + supervisor) + revalidatePath + تمرير النتيجة.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  planDerivedDrafts,
  applyDerivedDrafts,
  type ScenarioDerivedPlan,
  type ApplyResult,
} from "@/lib/scenario-derivation/service";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const gate = await requireRole([...WRITE_ROLES]);
  if (!gate.ok) return { ok: false as const, message: gate.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: gate.userId ?? null };
}

/**
 * planOnly=true → يرجع الخطة دون كتابة (preview modal).
 * planOnly=false → ينفّذ الإنشاء ويرجع الـ IDs المُنشأة.
 */
export async function deriveDraftsFromScenarioAction(
  projectId: string,
  scenarioId: string,
  planOnly: boolean,
): Promise<ActionResult<{ plan: ScenarioDerivedPlan; applied?: ApplyResult }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!scenarioId) return { ok: false, message: "معرّف السيناريو مطلوب." };
  try {
    const plan = await planDerivedDrafts(scenarioId);
    if (planOnly) {
      return { ok: true, data: { plan } };
    }
    const applied = await applyDerivedDrafts(scenarioId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { plan, applied } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الاشتقاق." };
  }
}
