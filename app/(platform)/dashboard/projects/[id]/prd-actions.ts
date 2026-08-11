"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PRDGenerationEngine,
  type GenerationResult,
  isProductModeV2Project,
  PRD_GATE_MESSAGES,
} from "@/lib/prd/generation-service";
import { applyManualSectionEdit } from "@/lib/prd/versioning";
import { createServiceClient } from "@/lib/supabase/service";
import type { PRDSectionKey, PRDVersion } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * توليد PRD كـ Background Job: بنحجز الـ Lock ونرجّع فورًا ("started")،
 * والتوليد الفعلي (مع الانتظار على Rate Limit) بيحصل في after() — نفس
 * أسلوب Prototype Prompt. كده حالة "جاري التوليد" بتفضل ظاهرة حتى لو
 * المستخدم عمل Refresh أو ساب الصفحة ورجع.
 */
export async function generateFullPRD(
  projectId: string,
  isRegeneration: boolean
): Promise<GenerationResult> {
  const actorId = await getActorId();

  // Product Mode + v2 gate: نتأكد من وجود Requirements قبل ما نحجز lock ولا
  // نبدأ Background Job. رسالة واضحة للـ UX بدل ما التوليد يفشل في الخلفية.
  const svc = createServiceClient();
  const productModeV2 = await isProductModeV2Project(svc, projectId, actorId);
  if (productModeV2) {
    const { count } = await svc
      .from("product_requirements")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if ((count ?? 0) === 0) {
      return {
        status: "missing_requirements",
        message: PRD_GATE_MESSAGES.missingRequirements,
      };
    }
  }

  const claimed = await PRDGenerationEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PRDGenerationEngine.runFullGenerationCore(
        projectId,
        isRegeneration ? "conflict_replace" : "full_generation",
        actorId
      );
    } catch (err) {
      console.error("[PRD background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function regeneratePRDSection(
  projectId: string,
  sectionKey: PRDSectionKey
): Promise<GenerationResult> {
  const actorId = await getActorId();
  const result = await PRDGenerationEngine.regenerateSection(projectId, sectionKey, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editPRDSection(
  projectId: string,
  sectionKey: PRDSectionKey,
  value: unknown
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();
  await applyManualSectionEdit(supabase, projectId, sectionKey, value, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

/**
 * اعتماد PRD — يحوّل status من draft إلى approved.
 * Quick Approve (UX): كل تعديل لاحق هيبني نسخة جديدة تلقائيًا عن طريق
 * versioning system، مافيش داعي لأي عمل إضافي هنا.
 */
export async function approvePRDAction(
  projectId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const svc = createServiceClient();
  const actorId = await getActorId();
  const { data: prd, error: readErr } = await svc
    .from("prds")
    .select("id,status")
    .eq("project_id", projectId)
    .maybeSingle();
  if (readErr) return { ok: false, message: readErr.message };
  if (!prd) return { ok: false, message: "لا يوجد PRD لهذا المشروع." };
  if (prd.status === "approved") return { ok: true };
  const { error } = await svc
    .from("prds")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", prd.id);
  if (error) return { ok: false, message: error.message };
  void actorId;
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getPRDVersions(projectId: string): Promise<PRDVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prd_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as PRDVersion[];
}
