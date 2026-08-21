"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PrototypePromptGenerationEngine,
  type PromptGenerationResult,
} from "@/lib/prototype-prompt/generation-service";
import { applyManualSectionEdit } from "@/lib/prototype-prompt/versioning";
import type { PrototypePromptSectionKey, PrototypePromptVersion } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * توليد الـ Prototype Prompt كـ Background Job: بنحجز الـ Lock ونرجّع
 * فورًا ("started")، والتوليد الفعلي (مع الانتظار على Rate Limit) بيحصل
 * في after() بعد ما الاستجابة ترجع. كده حالة "جاري التوليد" بتتحفظ في
 * الـ DB وبتفضل ظاهرة حتى لو المستخدم عمل Refresh أو ساب الصفحة ورجع —
 * نفس أسلوب Discovery Analysis. الواجهة بتعمل Polling لحد ما تخلص.
 */
export async function generateFullPrototypePrompt(
  projectId: string,
  targetTool: string,
  isRegeneration: boolean
): Promise<PromptGenerationResult> {
  const actorId = await getActorId();

  const claimed = await PrototypePromptGenerationEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PrototypePromptGenerationEngine.runFullGenerationCore(
        projectId,
        targetTool,
        isRegeneration ? "conflict_replace" : "full_generation",
        actorId
      );
    } catch (err) {
      console.error("[PrototypePrompt background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function regeneratePrototypePromptSection(
  projectId: string,
  sectionKey: PrototypePromptSectionKey
): Promise<PromptGenerationResult> {
  const actorId = await getActorId();
  const result = await PrototypePromptGenerationEngine.regenerateSection(
    projectId,
    sectionKey,
    actorId
  );
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editPrototypePromptSection(
  projectId: string,
  sectionKey: PrototypePromptSectionKey,
  value: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSectionEdit(supabase, projectId, sectionKey, value, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getPrototypePromptVersions(projectId: string): Promise<PrototypePromptVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prototype_prompt_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as PrototypePromptVersion[];
}

// ============================================================================
// 0125 — Prototype Change Prompt Generation (المرحلة ج، Standard Product
// Package). هذا نظام منفصل تمامًا عن التوليد الكامل فوق (PrototypePromptGenerationEngine
// اللي بيولّد Prompt شامل من الصفر لكل المشروع من PRD/Brain) — هنا بنولّد
// Prompt صغير ومركَّز يعكس **فقط** تغيير معتمَد اتطبّق فعليًا على بيانات
// المنتج (change_impacts بحالة 'applied')، مش إعادة توليد الـ Prototype
// كله. راجع lib/sector-standards/prototype-prompt-service.ts.
// ============================================================================
import { requireRole } from "@/lib/auth/rbac";
import { generatePrototypeChangePrompt, listPrototypeChangePrompts } from "@/lib/sector-standards/prototype-prompt-service";
import type { PrototypeChangePromptRow } from "@/lib/sector-standards/prototype-prompt-types";

type ChangePromptActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

/**
 * قرار RBAC: توليد Prompt تغيير ده إجراء "قراءة-ملحق" (read-adjacent) —
 * بيقرأ فقط change_impacts بحالة 'applied' فعليًا (بيانات معروضة أصلًا
 * لنفس الأدوار في change-request-actions.ts)، وبيكتب حصريًا على
 * prototype_change_prompts (جدول عرضي، مش حقيقة منتج). فبنسمح بيه لنفس
 * BROAD_ROLES المسموح لها بتشغيل تحليل الأثر هناك (owner/admin/
 * supervisor/member) — مش محصور على أدوار الكتابة، لأنه أبدًا ما بيلمسش
 * بيانات المنتج الحقيقية.
 */
const CHANGE_PROMPT_BROAD_ROLES = ["owner", "admin", "supervisor", "member"] as const;

async function guardChangePromptBroad() {
  const g = await requireRole([...CHANGE_PROMPT_BROAD_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

export async function generatePrototypeChangePromptAction(
  changeRequestId: string,
  projectId: string,
  prototypeTool?: string
): Promise<ChangePromptActionResult<PrototypeChangePromptRow>> {
  const g = await guardChangePromptBroad();
  if (!g.ok) return g;
  try {
    const result = await generatePrototypeChangePrompt(changeRequestId, g.userId, prototypeTool);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: result.prompt };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل توليد Prompt الـ Prototype." };
  }
}

export async function listPrototypeChangePromptsAction(
  changeRequestId: string
): Promise<ChangePromptActionResult<PrototypeChangePromptRow[]>> {
  const g = await guardChangePromptBroad();
  if (!g.ok) return g;
  try {
    const data = await listPrototypeChangePrompts(changeRequestId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب Prompts الـ Prototype." };
  }
}
