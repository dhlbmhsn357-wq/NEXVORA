import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildExecutionPlanPrompt, buildStagePrompt } from "@/lib/ai/prompts/prototype-prompt-pipeline";
import { validateExecutionPlan, validateStageContent } from "@/lib/ai/validation/prototype-prompt-pipeline";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { getTemplate } from "@/lib/prototype-prompt/templates/registry";
import { CODE_WRITING_STANDARDS_HEADING, CODE_WRITING_STANDARDS_BODY } from "@/lib/prototype-prompt/code-standards";
import type { PRD, PrototypePromptPlan, PrototypePromptStage } from "@/lib/types/database";
import type { ExistingStage, PlanModule } from "@/lib/prototype-prompt/stage-reconciler";
import { reconcileStages } from "@/lib/prototype-prompt/stage-reconciler";
import { listOpenIncrements, setIncrementStatus } from "@/lib/increments/service";

export type PipelinePlanningResult =
  | { status: "started" }
  | { status: "already_generating" }
  | { status: "missing_data"; message: string };

export type PipelineStageResult =
  | { status: "started" }
  | { status: "already_generating" }
  | { status: "not_ready"; message: string };

/** أي Lock معلّق أقدم من كده يُعتبر Job مات ويُعاد المحاولة فوقه — نفس نمط باقي المولدات. */
const STALE_LOCK_MS = 6 * 60_000;

async function getPrdOrNull(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  return data as PRD | null;
}

async function getOrCreatePlan(supabase: SupabaseClient, projectId: string): Promise<PrototypePromptPlan> {
  const { data: existing } = await supabase
    .from("prototype_prompt_plans")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (existing) return existing as PrototypePromptPlan;

  const { data: created, error } = await supabase
    .from("prototype_prompt_plans")
    .insert({ project_id: projectId })
    .select("*")
    .single();
  if (error || !created) {
    throw new Error(`فشل إنشاء خطة التنفيذ: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as PrototypePromptPlan;
}

/**
 * Prototype Prompt Pipeline Engine — نظام V2 مستقل تمامًا عن
 * PrototypePromptGenerationEngine (النظام القديم بـ Prompt واحد لكل
 * مشروع يفضل شغال زي ما هو من غير أي لمس). المدخل الوحيد للتخطيط
 * وتوليد الـ Stages.
 */
export class PrototypePromptPipelineEngine {
  static async tryClaimPlanningLock(projectId: string, targetTool: string): Promise<boolean> {
    const supabase = createServiceClient();
    await getOrCreatePlan(supabase, projectId);

    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("prototype_prompt_plans")
      .update({ status: "generating", last_error: null, target_tool: targetTool })
      .eq("project_id", projectId)
      .or(`status.neq.generating,updated_at.lt.${staleCutoff}`)
      .select("project_id");

    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /**
   * جوهر مرحلة التخطيط — يفترض إن الـ Lock محجوز بالفعل. بيتشغّل داخل
   * after() في الخلفية. عند النجاح: بيمسح الـ Stages القديمة (لو فيه
   * إعادة تخطيط) وينشئ صف Stage جديد لكل موديول بحالة "pending"، بدون
   * ما يستدعي توليد أي Stage — الـ Client هو اللي بيشغّل كل Stage
   * بالترتيب عبر Polling، عشان كل استدعاء AI يفضل جوّه حد وقت آمن
   * ومنفصل بدل جلسة خلفية واحدة ضخمة ممكن تتجاوز حد التنفيذ.
   */
  /**
   * @param mode `"additive"` (الافتراضي) بيحافظ على المراحل القائمة ومحتواها
   * ويضيف الجديد بس. `"replace"` بيعيد بناء الخطة بالكامل — للطلب الصريح.
   */
  static async runPlanningCore(
    projectId: string,
    actorId?: string,
    mode: "additive" | "replace" = "additive"
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await releasePlanAsFailed(supabase, projectId, "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً.");
        return;
      }

      const prd = await getPrdOrNull(supabase, projectId);
      if (!prd || !prd.overview.trim()) {
        await releasePlanAsFailed(supabase, projectId, "لا يوجد PRD معتمد لهذا المشروع — أنشئه أولاً.");
        return;
      }

      const plan = await getOrCreatePlan(supabase, projectId);
      const template = getTemplate(plan.target_tool);
      const projectRow = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
      const projectName = (projectRow.data?.name as string | undefined) ?? "المشروع";

      const prompt = buildExecutionPlanPrompt(projectName, template, brain.content, prd);
      const response = await executeAIWithRateLimitWait(AITaskType.PROTOTYPE_PROMPT_PIPELINE_PLANNING, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد خطة التنفيذ.";
        await releasePlanAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validateExecutionPlan(response.output);
      if (!validation.ok) {
        console.error(`[PrototypePromptPipeline] Plan validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releasePlanAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة تخطيط التنفيذ.");
        return;
      }

      const newVersion = plan.version + 1;

      // إعادة التخطيط الافتراضية **إضافية**: المراحل القائمة تفضل بمحتواها
      // وأرقامها، والموديول الجديد بس هو اللي بيتضاف في آخر الخط. قبل كده
      // كان فيه delete() لكل المراحل، فأي معلومة جديدة كانت بتمسح كل
      // البرومتات المتولّدة نهائيًا (ومفيش جدول نسخ للمراحل).
      const { data: existingStageRows } = await supabase
        .from("prototype_prompt_stages")
        .select("id, stage_index, title, status, content")
        .eq("plan_id", plan.id);

      const existingStages: ExistingStage[] = (existingStageRows ?? []).map((row) => ({
        id: row.id as string,
        stage_index: row.stage_index as number,
        title: (row.title as string) ?? "",
        status: (row.status as string) ?? "pending",
        has_content: Boolean(row.content),
      }));

      const reconciled = reconcileStages(
        existingStages,
        validation.data.modules,
        (plan.modules as PlanModule[] | null) ?? [],
        mode
      );

      if (reconciled.deleteStageIds.length > 0) {
        await supabase
          .from("prototype_prompt_stages")
          .delete()
          .in("id", reconciled.deleteStageIds);
      }

      // المراحل الجديدة بتتربط بأحدث زيادة مفتوحة، عشان يبقى واضح إن
      // البرومت ده اتولّد بسبب الاجتماع/الجلسة دي بالتحديد — ولإن الزيادة
      // تتنقل لحالة "prompted" بدل ما تفضل مفتوحة للأبد.
      const openIncrements = await listOpenIncrements(supabase, projectId);
      const linkedIncrementId = openIncrements[0]?.id ?? null;

      if (reconciled.inserts.length > 0) {
        const stageRows = reconciled.inserts.map((m) => ({
          plan_id: plan.id,
          project_id: projectId,
          stage_index: m.stage_index,
          title: m.title,
          summary: m.summary,
          depends_on: m.depends_on,
          status: "pending" as const,
          increment_id: linkedIncrementId,
        }));
        const { error: insertErr } = await supabase
          .from("prototype_prompt_stages")
          .insert(stageRows);
        if (insertErr) {
          await releasePlanAsFailed(supabase, projectId, `فشل إنشاء Stages: ${insertErr.message}`);
          return;
        }
        if (linkedIncrementId) await setIncrementStatus(linkedIncrementId, "prompted");
      }

      await supabase
        .from("prototype_prompt_plans")
        .update({
          version: newVersion,
          project_size: validation.data.project_size,
          execution_summary: validation.data.execution_summary,
          modules: reconciled.mergedModules,
          stage_count: reconciled.mergedModules.length,
          // مفيش مراحل جديدة تتولّد → الخطة جاهزة على طول بدل ما تفضل
          // معلّقة في "generating" مستنية توليد مش هيحصل.
          status: reconciled.inserts.length > 0 ? "generating" : "ready",
          last_error: null,
          generated_from_prd_version: prd.version,
          generated_from_brain_version: brain.version,
          created_by: actorId ?? null,
        })
        .eq("project_id", projectId);
    } catch (err) {
      console.error(`[PrototypePromptPipeline] Unexpected planning failure for project ${projectId}:`, err);
      await releasePlanAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التخطيط.");
    }
  }

  /** يحجز Lock على Stage واحد بس (بدون تنفيذ التوليد نفسه). */
  static async tryClaimStageLock(projectId: string, stageIndex: number): Promise<boolean> {
    const supabase = createServiceClient();
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("prototype_prompt_stages")
      .update({ status: "generating", last_error: null })
      .eq("project_id", projectId)
      .eq("stage_index", stageIndex)
      .or(`status.neq.generating,updated_at.lt.${staleCutoff}`)
      .select("id");

    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /**
   * جوهر توليد Stage واحد — بيفترض إن الـ Lock محجوز بالفعل. بيستخدم
   * ملخصات الموديولات السابقة بس (من plan.modules)، مش محتوى الـ
   * Stages الفعلي، عشان مايبعتش آلاف الأسطر مع كل طلب.
   */
  static async runStageCore(projectId: string, stageIndex: number, actorId?: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const plan = await getOrCreatePlan(supabase, projectId);
      const targetModule = plan.modules.find((m) => m.index === stageIndex);
      if (!targetModule) {
        await releaseStageAsFailed(supabase, projectId, stageIndex, "الموديول غير موجود في الخطة الحالية.");
        return;
      }

      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      const prd = await getPrdOrNull(supabase, projectId);
      if (!brain || !prd) {
        await releaseStageAsFailed(supabase, projectId, stageIndex, "Project Brain أو PRD غير متاحين.");
        return;
      }

      const template = getTemplate(plan.target_tool);
      const projectRow = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
      const projectName = (projectRow.data?.name as string | undefined) ?? "المشروع";

      const priorModules = plan.modules.filter((m) => m.index < stageIndex);
      const prompt = buildStagePrompt(projectName, template, brain.content, prd, targetModule, priorModules, plan.stage_count);

      const response = await executeAIWithRateLimitWait(AITaskType.PROTOTYPE_PROMPT_PIPELINE_STAGE, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد المرحلة.";
        await releaseStageAsFailed(supabase, projectId, stageIndex, friendly);
        return;
      }

      const validation = validateStageContent(response.output);
      if (!validation.ok) {
        await releaseStageAsFailed(supabase, projectId, stageIndex, validation.reason);
        return;
      }

      // الدستور الهندسي (Engineering Constitution) أول حاجة في كل Stage —
      // قبل تفاصيل التنفيذ الخاصة بالمشروع — عشان يحكم الكود من أول سطر.
      const fullContent = `# ${CODE_WRITING_STANDARDS_HEADING}\n\n${CODE_WRITING_STANDARDS_BODY}\n\n${validation.content}`;

      await supabase
        .from("prototype_prompt_stages")
        .update({ content: fullContent, status: "ready", last_error: null })
        .eq("project_id", projectId)
        .eq("stage_index", stageIndex);

      const { data: remaining } = await supabase
        .from("prototype_prompt_stages")
        .select("stage_index")
        .eq("plan_id", plan.id)
        .neq("status", "ready");
      if ((remaining?.length ?? 0) === 0) {
        await supabase.from("prototype_prompt_plans").update({ status: "ready" }).eq("project_id", projectId);
      }
    } catch (err) {
      console.error(`[PrototypePromptPipeline] Unexpected stage failure for project ${projectId}, stage ${stageIndex}:`, err);
      await releaseStageAsFailed(supabase, projectId, stageIndex, err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    }
  }
}

async function releasePlanAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase.from("prototype_prompt_plans").update({ status: "failed", last_error: message }).eq("project_id", projectId);
}

async function releaseStageAsFailed(supabase: SupabaseClient, projectId: string, stageIndex: number, message: string) {
  await supabase
    .from("prototype_prompt_stages")
    .update({ status: "failed", last_error: message })
    .eq("project_id", projectId)
    .eq("stage_index", stageIndex);
}

export async function getPipelineState(
  projectId: string
): Promise<{ plan: PrototypePromptPlan | null; stages: PrototypePromptStage[] }> {
  const supabase = createServiceClient();
  const [{ data: plan }, { data: stages }] = await Promise.all([
    supabase.from("prototype_prompt_plans").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("prototype_prompt_stages").select("*").eq("project_id", projectId).order("stage_index", { ascending: true }),
  ]);
  return { plan: (plan as PrototypePromptPlan) ?? null, stages: (stages as PrototypePromptStage[]) ?? [] };
}
