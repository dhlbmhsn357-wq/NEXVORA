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
import {
  planScenariosFromStories,
  applyScenariosFromStories,
  applyScenarioForStory,
  type DerivedScenarioPlan,
} from "@/lib/scenario-derivation/from-story";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserStoryRow } from "@/lib/user-stories/types";

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

// ---------------------------------------------------------------------------
// Story → Scenario (اتجاه معاكس: توليد سيناريوهات مسوّدة من القصص المعتمدة)
// ---------------------------------------------------------------------------

/**
 * Preview: يرجع خطة توليد سيناريوهات مسوّدة من القصص المعتمدة (approved / in_dev /
 * done) اللي مالهاش سيناريو مرتبط بعد. Idempotent.
 */
export async function planScenariosFromStoriesAction(
  projectId: string,
): Promise<ActionResult<DerivedScenarioPlan>> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    const plan = await planScenariosFromStories(projectId);
    return { ok: true, data: plan };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التخطيط." };
  }
}

/**
 * Apply: ينفّذ خطة `planScenariosFromStoriesAction`، ينشئ السيناريوهات كـ draft
 * ويربط كل سيناريو بـ linkedStoryId. Idempotent.
 */
export async function applyScenariosFromStoriesAction(
  projectId: string,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    const res = await applyScenariosFromStories(projectId, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { created: res.created, skipped: res.skipped } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

/**
 * توليد سيناريو من قصة واحدة — للاستخدام كزر لكل قصة في stories-panel.
 * يرجّع created=0 لو القصة عندها سيناريو أصلًا (idempotent).
 */
export async function generateScenarioForStoryAction(
  projectId: string,
  storyId: string,
): Promise<ActionResult<{ created: number; scenarioId: string | null }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!storyId) return { ok: false, message: "معرّف القصة مطلوب." };
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from("user_stories")
      .select("*")
      .eq("id", storyId)
      .eq("project_id", projectId)
      .single();
    if (error || !data) {
      return { ok: false, message: "لم يتم العثور على القصة." };
    }
    const row = data as Record<string, unknown>;
    const story: UserStoryRow = {
      id: String(row.id),
      projectId: String(row.project_id),
      code: (row.code as string | null) ?? null,
      title: String(row.title ?? ""),
      asA: String(row.as_a ?? ""),
      iWant: String(row.i_want ?? ""),
      soThat: String(row.so_that ?? ""),
      narrativeExtra: String(row.narrative_extra ?? ""),
      status: row.status as UserStoryRow["status"],
      storyPoints: (row.story_points as number | null) ?? null,
      businessValue: Number(row.business_value ?? 50),
      riskLevel: row.risk_level as UserStoryRow["riskLevel"],
      linkedPersonaId: (row.linked_persona_id as string | null) ?? null,
      linkedFlowId: (row.linked_flow_id as string | null) ?? null,
      linkedRequirementId: (row.linked_requirement_id as string | null) ?? null,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    };
    const res = await applyScenarioForStory(projectId, story, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}
