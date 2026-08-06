"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PrototypePromptPipelineEngine,
  getPipelineState,
  type PipelinePlanningResult,
  type PipelineStageResult,
} from "@/lib/prototype-prompt/pipeline-generation-service";
import type { PrototypePromptPlan, PrototypePromptStage } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * بداية/إعادة تخطيط السلسلة كاملة — Background Job: بيحجز الـ Lock
 * ويرجّع فورًا، والتخطيط الفعلي (تحليل المشروع + تقسيمه لموديولات) بيحصل
 * في after(). لما التخطيط يخلص، الواجهة (عبر Polling) هي اللي بتشغّل كل
 * Stage بالترتيب — مش الخلفية نفسها — عشان كل استدعاء AI يفضل جوّه حد
 * وقت تنفيذ آمن بدل جلسة خلفية واحدة ضخمة لمشروع كبير (٢٠ Stage).
 */
export async function generatePrototypePromptPipelinePlan(
  projectId: string,
  targetTool: string,
  mode: "additive" | "replace" = "additive"
): Promise<PipelinePlanningResult> {
  const actorId = await getActorId();

  const claimed = await PrototypePromptPipelineEngine.tryClaimPlanningLock(projectId, targetTool);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PrototypePromptPipelineEngine.runPlanningCore(projectId, actorId, mode);
    } catch (err) {
      console.error("[PrototypePromptPipeline planning background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

/**
 * توليد Stage واحد — بتستخدمه الواجهة تلقائيًا (عبر Polling) للانتقال
 * للـ Stage التالي، وكمان لإعادة توليد Stage معين يدويًا (Retry/
 * Regenerate). Background Job بنفس النمط.
 */
export async function generatePrototypePromptPipelineStage(
  projectId: string,
  stageIndex: number
): Promise<PipelineStageResult> {
  const actorId = await getActorId();

  const claimed = await PrototypePromptPipelineEngine.tryClaimStageLock(projectId, stageIndex);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PrototypePromptPipelineEngine.runStageCore(projectId, stageIndex, actorId);
    } catch (err) {
      console.error("[PrototypePromptPipeline stage background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getPrototypePromptPipeline(
  projectId: string
): Promise<{ plan: PrototypePromptPlan | null; stages: PrototypePromptStage[] }> {
  return getPipelineState(projectId);
}
