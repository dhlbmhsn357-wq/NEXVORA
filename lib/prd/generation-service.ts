import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { buildPRDGenerationPrompt, buildPRDSectionRegenerationPrompt } from "@/lib/ai/prompts/prd-generation";
import { validatePRDGeneration, validatePRDSectionRegeneration } from "@/lib/ai/validation/prd-generation";
import { applyFullGeneration, applySectionRegeneration, getOrCreatePrd } from "./versioning";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { buildFusedKnowledgeBlock } from "@/lib/domain-library/fusion/fusion-service";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import {
  buildContextResult,
  computePromptReadiness,
  getProfile,
  persistPromptGeneration,
} from "@/lib/ai/prompt-framework";
import type { PRDSectionKey, ProjectRecommendation } from "@/lib/types/database";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { RequirementRow, UserFlowRow, FlowStep } from "@/lib/product-definition/types";
import type { UserStoryRow, AcceptanceCriterionRow } from "@/lib/user-stories/types";
import type { BusinessRuleRow, SystemMessageRow } from "@/lib/product-definition/business-rules-types";

/**
 * سياق مُهيكل مصدره جداول Product Definition + User Stories + AC.
 * لما يبقى موجود، بيبقى المصدر الأساسي لبناء أقسام user_stories +
 * acceptance_criteria في PRD، والبراين يفضل داعم لباقي الأقسام.
 *
 * businessRules/systemMessages/flowsWithDetail (0116): مصدر zero-invention
 * صارم لأقسام business_rules_detail/system_messages_detail/flow_specifications —
 * لازم تكون موجودة فعليًا في الجداول المُهيكلة، ممنوع تُستنتج من Brain.
 */
export interface StructuredPRDContext {
  requirements: RequirementRow[];
  stories: UserStoryRow[];
  acceptanceCriteria: AcceptanceCriterionRow[];
  businessRules: BusinessRuleRow[];
  systemMessages: SystemMessageRow[];
  /** تدفّقات فيها على الأقل خطوة واحدة بتفاصيل تنفيذية (uiElements/successMessage/errorMessages) — باقي التدفقات مُستبعدة عشان متعملش ضوضاء. */
  flowsWithDetail: UserFlowRow[];
}

/** يقرأ الجداول المُهيكلة بدون رمي أخطاء — أي فشل يرجع صف فاضي. */
export async function getStructuredContextForPRD(
  projectId: string,
  supabase: SupabaseClient
): Promise<StructuredPRDContext> {
  const [reqRes, storiesRes, acRes, businessRulesRes, systemMessagesRes, flowsRes] = await Promise.all([
    supabase
      .from("product_requirements")
      .select("*")
      .eq("project_id", projectId)
      .order("priority", { ascending: true }),
    supabase
      .from("user_stories")
      .select("*")
      .eq("project_id", projectId)
      .order("status", { ascending: true }),
    supabase
      .from("acceptance_criteria")
      .select("*")
      .eq("project_id", projectId)
      .order("user_story_id", { ascending: true })
      .order("order_index", { ascending: true }),
    supabase
      .from("business_rules")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("system_messages")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_flows")
      .select("*")
      .eq("project_id", projectId)
      .order("flow_type", { ascending: true }),
  ]);

  const requirements = ((reqRes.data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      projectId: String(row.project_id ?? ""),
      code: (row.code as string | null) ?? null,
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      requirementType: (row.requirement_type as RequirementRow["requirementType"]) ?? "functional",
      priority: (row.priority as RequirementRow["priority"]) ?? "should",
      status: (row.status as RequirementRow["status"]) ?? "draft",
      rationale: String(row.rationale ?? ""),
      acceptanceHint: String(row.acceptance_hint ?? ""),
      effortEstimate: String(row.effort_estimate ?? ""),
      linkedPersonaId: (row.linked_persona_id as string | null) ?? null,
      linkedFlowId: (row.linked_flow_id as string | null) ?? null,
      tags: (row.tags as string[] | null) ?? [],
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    } as RequirementRow;
  });

  const stories = ((storiesRes.data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      projectId: String(row.project_id ?? ""),
      code: (row.code as string | null) ?? null,
      title: String(row.title ?? ""),
      asA: String(row.as_a ?? ""),
      iWant: String(row.i_want ?? ""),
      soThat: String(row.so_that ?? ""),
      narrativeExtra: String(row.narrative_extra ?? ""),
      status: (row.status as UserStoryRow["status"]) ?? "draft",
      storyPoints: (row.story_points as number | null) ?? null,
      businessValue: Number(row.business_value ?? 50),
      riskLevel: (row.risk_level as UserStoryRow["riskLevel"]) ?? "medium",
      linkedPersonaId: (row.linked_persona_id as string | null) ?? null,
      linkedFlowId: (row.linked_flow_id as string | null) ?? null,
      linkedRequirementId: (row.linked_requirement_id as string | null) ?? null,
      tags: (row.tags as string[] | null) ?? [],
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    } as UserStoryRow;
  });

  const acceptanceCriteria = ((acRes.data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      userStoryId: String(row.user_story_id ?? ""),
      projectId: String(row.project_id ?? ""),
      orderIndex: Number(row.order_index ?? 1),
      title: String(row.title ?? ""),
      givenClause: String(row.given_clause ?? ""),
      whenClause: String(row.when_clause ?? ""),
      thenClause: String(row.then_clause ?? ""),
      andConditions: (row.and_conditions as string[] | null) ?? [],
      status: (row.status as AcceptanceCriterionRow["status"]) ?? "draft",
      notes: String(row.notes ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    } as AcceptanceCriterionRow;
  });

  const businessRules = ((businessRulesRes.data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      projectId: String(row.project_id ?? ""),
      title: String(row.title ?? ""),
      triggerCondition: String(row.trigger_condition ?? ""),
      thresholdValue: String(row.threshold_value ?? ""),
      onViolation: String(row.on_violation ?? ""),
      enforcementPoint: (row.enforcement_point as BusinessRuleRow["enforcementPoint"]) ?? "server",
      linkedFlowId: (row.linked_flow_id as string | null) ?? null,
      notes: String(row.notes ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    } as BusinessRuleRow;
  });

  const systemMessages = ((systemMessagesRes.data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      projectId: String(row.project_id ?? ""),
      eventName: String(row.event_name ?? ""),
      messageType: (row.message_type as SystemMessageRow["messageType"]) ?? "info",
      messageText: String(row.message_text ?? ""),
      linkedFlowId: (row.linked_flow_id as string | null) ?? null,
      notes: String(row.notes ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    } as SystemMessageRow;
  });

  const allFlows = ((flowsRes.data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    const steps = (Array.isArray(row.steps) ? row.steps : []) as FlowStep[];
    return {
      id: String(row.id ?? ""),
      projectId: String(row.project_id ?? ""),
      personaId: (row.persona_id as string | null) ?? null,
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      flowType: (row.flow_type as UserFlowRow["flowType"]) ?? "primary",
      triggerEvent: String(row.trigger_event ?? ""),
      successOutcome: String(row.success_outcome ?? ""),
      steps,
      notes: String(row.notes ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      createdBy: (row.created_by as string | null) ?? null,
    } as UserFlowRow;
  });

  // فلتر: بس التدفّقات اللي فيها على الأقل خطوة واحدة بتفاصيل تنفيذية —
  // باقي التدفقات مُستبعدة عشان القسم متتعملش فيه ضوضاء بلا فايدة.
  const flowsWithDetail = allFlows.filter((f) =>
    f.steps.some(
      (s) => (s.uiElements && s.uiElements.length > 0) || !!s.successMessage || (s.errorMessages && s.errorMessages.length > 0)
    )
  );

  return { requirements, stories, acceptanceCriteria, businessRules, systemMessages, flowsWithDetail };
}

/**
 * يبني قسم نصّي مُهيكَل يُحقن كـ PRIMARY SOURCE في برومبت PRD. يبقى فاضي
 * لو مافيش أي بيانات مُهيكلة (v1 projects أو Product Mode بدون إدخال بعد).
 */
export function formatStructuredContextForPrompt(ctx: StructuredPRDContext): string {
  if (
    ctx.requirements.length === 0 &&
    ctx.stories.length === 0 &&
    ctx.acceptanceCriteria.length === 0 &&
    ctx.businessRules.length === 0 &&
    ctx.systemMessages.length === 0 &&
    ctx.flowsWithDetail.length === 0
  ) {
    return "";
  }

  const parts: string[] = [];
  parts.push("## البيانات المُهيكلة (المصدر الأساسي — استخدمها قبل ما تخترع)");

  if (ctx.requirements.length > 0) {
    parts.push("### المتطلبات (Requirements)");
    for (const r of ctx.requirements) {
      const prefix = r.code ? `[${r.code}] ` : "";
      parts.push(
        `- ${prefix}${r.title} — نوع: ${r.requirementType}، أولوية: ${r.priority}، حالة: ${r.status}`
      );
      if (r.description) parts.push(`  الوصف: ${r.description}`);
      if (r.rationale) parts.push(`  المبرّر: ${r.rationale}`);
      if (r.acceptanceHint) parts.push(`  تلميح قبول: ${r.acceptanceHint}`);
    }
  }

  if (ctx.stories.length > 0) {
    parts.push("\n### قصص المستخدم (User Stories)");
    const acByStory = new Map<string, AcceptanceCriterionRow[]>();
    for (const ac of ctx.acceptanceCriteria) {
      const list = acByStory.get(ac.userStoryId) ?? [];
      list.push(ac);
      acByStory.set(ac.userStoryId, list);
    }
    for (const s of ctx.stories) {
      const code = s.code ? `[${s.code}] ` : "";
      parts.push(`- ${code}${s.title} (حالة: ${s.status}، مخاطرة: ${s.riskLevel})`);
      if (s.asA || s.iWant || s.soThat) {
        parts.push(`  بصفتي: ${s.asA} — أريد: ${s.iWant} — حتى: ${s.soThat}`);
      }
      const relatedAc = acByStory.get(s.id) ?? [];
      for (const ac of relatedAc) {
        const title = ac.title ? ` — ${ac.title}` : "";
        parts.push(
          `  • AC${title}: Given ${ac.givenClause} / When ${ac.whenClause} / Then ${ac.thenClause}`
        );
        for (const and of ac.andConditions) {
          if (and.trim()) parts.push(`      And ${and}`);
        }
      }
    }
  } else if (ctx.acceptanceCriteria.length > 0) {
    // AC بدون قصة أب (نادر) — نعرضها كمعايير قائمة.
    parts.push("\n### معايير القبول (Acceptance Criteria)");
    for (const ac of ctx.acceptanceCriteria) {
      const title = ac.title ? ` — ${ac.title}` : "";
      parts.push(
        `- Given ${ac.givenClause} / When ${ac.whenClause} / Then ${ac.thenClause}${title}`
      );
    }
  }

  if (ctx.businessRules.length > 0) {
    parts.push("\n### قواعد العمل والحالات الخاصة");
    for (const b of ctx.businessRules) {
      parts.push(`- ${b.title} — تطبيق: ${b.enforcementPoint}`);
      if (b.triggerCondition) parts.push(`  الشرط المُفعِّل: ${b.triggerCondition}`);
      if (b.thresholdValue) parts.push(`  القيمة الحدّية: ${b.thresholdValue}`);
      if (b.onViolation) parts.push(`  عند التجاوز: ${b.onViolation}`);
    }
  }

  if (ctx.systemMessages.length > 0) {
    parts.push("\n### رسائل النظام");
    for (const m of ctx.systemMessages) {
      parts.push(`- [${m.messageType}] ${m.eventName}: "${m.messageText}"`);
    }
  }

  if (ctx.flowsWithDetail.length > 0) {
    parts.push("\n### مواصفات التدفقات التفصيلية");
    for (const f of ctx.flowsWithDetail) {
      parts.push(`- تدفّق: ${f.name}`);
      for (const s of f.steps) {
        const hasDetail =
          (s.uiElements && s.uiElements.length > 0) || !!s.successMessage || (s.errorMessages && s.errorMessages.length > 0);
        if (!hasDetail) continue;
        parts.push(`  • خطوة ${s.order}: ${s.action}`);
        for (const el of s.uiElements ?? []) {
          parts.push(`      حقل: ${el.fieldName} — نوع: ${el.fieldType} — تحقق: ${el.validationRule}`);
        }
        if (s.successMessage) parts.push(`      رسالة نجاح: ${s.successMessage}`);
        for (const err of s.errorMessages ?? []) {
          parts.push(`      رسالة خطأ: ${err}`);
        }
      }
    }
  }

  parts.push(
    "\n**ملاحظة:** لأي عنصر موجود فوق، انقله كما هو في القسم المقابل من PRD (user_stories/acceptance_criteria/functional_requirements/non_functional_requirements/business_rules_detail/system_messages_detail/flow_specifications). ممنوع إعادة اختراع عنصر موجود. لأقسام business_rules_detail/system_messages_detail/flow_specifications تحديدًا: لو مفيش عناصر هنا فوق لقسم منهم، أرجع مصفوفة فارغة `[]` — ممنوع تخترع بدائل."
  );

  return parts.join("\n");
}

/**
 * Unified Prompt Framework (pilot — PRD): يسجّل Prompt Readiness Score +
 * إصدار البرومبت في prompt_generations، بدون تغيير نص البرومبت المُرسَل
 * (منخفض المخاطرة على مخرَج PRD المُثبَت). profile=prd، target=gemini.
 */
async function recordPrdPromptGeneration(
  supabase: SupabaseClient,
  projectId: string,
  promptText: string,
  brainVersion: number | null,
  recommendationsCount: number,
  actorId?: string
): Promise<void> {
  try {
    const profile = getProfile("prd");
    const ctx = buildContextResult([
      { key: "brain", title: "Project Brain", content: "معتمد", source: { type: "brain", version: brainVersion } },
      { key: "recommendations", title: "توصيات مقبولة", content: recommendationsCount > 0 ? String(recommendationsCount) : "" },
      { key: "project_context", title: "سياق المشروع", content: "متوفّر" },
    ]);
    const readiness = computePromptReadiness(profile, ctx.presentKeys);
    await persistPromptGeneration(supabase, {
      projectId,
      stage: "prd_generation",
      assembled: {
        text: promptText,
        metadata: { profile: "prd", target: "gemini", ruleKeys: profile.ruleKeys, claudeCodeWorkflowInjected: false, contextBlockTitles: ctx.blocks.map((b) => b.title) },
      },
      sources: ctx.sources,
      readiness,
      actorId,
    });
  } catch (err) {
    console.error(`[PromptFramework] PRD prompt record failed for project ${projectId}:`, err instanceof Error ? err.message : err);
  }
}

async function getAcceptedRecommendations(supabase: SupabaseClient, projectId: string): Promise<ProjectRecommendation[]> {
  const { data } = await supabase
    .from("project_recommendations")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "accepted");
  return (data as ProjectRecommendation[] | null) ?? [];
}

export type GenerationResult =
  | { status: "success" }
  | { status: "started" }
  | { status: "insufficient_brain"; message: string }
  | { status: "missing_requirements"; message: string }
  | { status: "already_generating" }
  | { status: "error"; message: string; code: string };

/**
 * يقرر ما إذا كان المشروع في Product Mode + Workflow v2 (الجيت الجديد
 * يُطبَّق عليه فقط). المشاريع v1 مش بتتأثر — Backwards compat.
 */
export async function isProductModeV2Project(
  supabase: SupabaseClient,
  projectId: string,
  actorId?: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("projects")
      .select("workflow_version")
      .eq("id", projectId)
      .maybeSingle();
    const version = (data as { workflow_version?: string | null } | null)?.workflow_version;
    if (version !== "v2") return false;
    return await isFeatureEnabled("product_mode", actorId ?? null, supabase);
  } catch (err) {
    console.error(`[PRDGeneration] product_mode check failed for ${projectId}:`, err);
    return false;
  }
}

/** رسائل الجيت الجديدة — مُصدَّرة عشان الأكشن يقدر يرجّعها زي ما هي. */
export const PRD_GATE_MESSAGES = {
  missingRequirements:
    "لا يمكن توليد PRD قبل إدخال متطلبات المنتج. افتح تبويب «تعريف المنتج» أولاً.",
  missingStoriesWarning:
    "لا توجد قصص مستخدم مُهيكلة — سيولّد الـ AI stories من Brain كـ fallback.",
} as const;

/** أي Lock بحالة "generating" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimGenerationLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase.from("prd").upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("prd")
    .update({ sync_status: "generating", last_error: null })
    .eq("project_id", projectId)
    .or(`sync_status.neq.generating,updated_at.lt.${staleCutoff}`)
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase.from("prd").update({ sync_status: "failed", last_error: message }).eq("project_id", projectId);
}

/**
 * PRD Generation Engine — المدخل الوحيد لتوليد/إعادة توليد PRD. يقرأ
 * Project Brain فقط (بدون تعديله)، يستدعي AIService (task_type =
 * PRD_GENERATION)، يتحقق من الرد، ويطبّقه عبر طبقة الـ Versioning.
 * قفل ذري على مستوى الـ DB يمنع أكتر من توليد للمشروع نفسه في نفس الوقت.
 */
export class PRDGenerationEngine {
  /** يحجز الـ Lock (أو يستعيده لو معلّق من Job مات) — بدون تنفيذ التوليد نفسه. */
  static async tryClaimLock(projectId: string): Promise<boolean> {
    const supabase = createServiceClient();
    return claimGenerationLock(supabase, projectId);
  }

  /**
   * جوهر التوليد الكامل — بيفترض إن الـ Lock محجوز بالفعل. بيتشغّل داخل
   * after() في الخلفية فبيقدر ينتظر على Rate Limit براحته. الحالة كلها
   * بتتحفظ في الـ DB (sync_status/last_error) والواجهة بتقرأها بالـ Polling.
   */
  static async runFullGenerationCore(
    projectId: string,
    reason: "full_generation" | "conflict_replace" | "auto_resync",
    actorId?: string
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await releaseLockAsFailed(
          supabase,
          projectId,
          "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً من تبويب Project Brain."
        );
        return;
      }
      // Phase 5 — "الـ PRD ممنوع يتولّد من معرفة خام" — لازم Brain Review يكون معتمد فعليًا.
      if (!brain.isApproved) {
        await releaseLockAsFailed(
          supabase,
          projectId,
          "لا يمكن توليد PRD — Project Brain لسه مش معتمد رسميًا. أكمل مراجعة Brain Review (اعتماد كل الأقسام/العناصر + حل المشاكل الحرجة) قبل التوليد."
        );
        return;
      }

      // ---- Product Mode + v2 gate — لازم يكون فيه Requirements قبل التوليد.
      const productModeV2 = await isProductModeV2Project(supabase, projectId, actorId);
      const structured = await getStructuredContextForPRD(projectId, supabase);
      if (productModeV2 && structured.requirements.length === 0) {
        await releaseLockAsFailed(supabase, projectId, PRD_GATE_MESSAGES.missingRequirements);
        return;
      }
      if (productModeV2 && structured.stories.length === 0) {
        // تحذير غير مانع — بس نسجّله في اللوج للـ traceability.
        console.warn(`[PRDGeneration] project ${projectId}: ${PRD_GATE_MESSAGES.missingStoriesWarning}`);
      }

      const acceptedRecommendations = await getAcceptedRecommendations(supabase, projectId);
      const fused = await buildFusedKnowledgeBlock(projectId, supabase);
      const structuredBlock = formatStructuredContextForPrompt(structured);
      const prompt = buildPRDGenerationPrompt(
        brain.content,
        acceptedRecommendations,
        fused.text,
        structuredBlock
      );
      await recordPrdPromptGeneration(supabase, projectId, prompt, brain.version ?? null, acceptedRecommendations.length, actorId);
      const response = await executeAIWithRateLimitWait(AITaskType.PRD_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد PRD.";
        await releaseLockAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validatePRDGeneration(response.output);
      if (!validation.ok) {
        console.error(`[PRDGeneration] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      await applyFullGeneration(supabase, projectId, validation.data, brain.version, reason, actorId);
    } catch (err) {
      console.error(`[PRDGeneration] Unexpected failure for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد.");
    }
  }

  static async regenerateSection(
    projectId: string,
    sectionKey: PRDSectionKey,
    actorId?: string
  ): Promise<GenerationResult> {
    const supabase = createServiceClient();

    const locked = await claimGenerationLock(supabase, projectId);
    if (!locked) return { status: "already_generating" };

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await supabase.from("prd").update({ sync_status: "idle" }).eq("project_id", projectId);
        return {
          status: "insufficient_brain",
          message: "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً من تبويب Project Brain.",
        };
      }
      if (!brain.isApproved) {
        await supabase.from("prd").update({ sync_status: "idle" }).eq("project_id", projectId);
        return {
          status: "insufficient_brain",
          message: "لا يمكن توليد PRD — Project Brain لسه مش معتمد رسميًا. أكمل مراجعة Brain Review قبل التوليد.",
        };
      }

      const currentPrd = await getOrCreatePrd(supabase, projectId);
      const { id, project_id, version, sync_status, last_error, created_by, created_at, updated_at, ...context } =
        currentPrd;
      void id;
      void project_id;
      void version;
      void sync_status;
      void last_error;
      void created_by;
      void created_at;
      void updated_at;

      // نفس الجيت في section regeneration — لو المشروع v2 + product_mode ومفيش
      // Requirements، منقدرش نعيد التوليد (رغم إن ده section واحد بس، لأن
      // القرار المعماري: PRD لازم يستمد من هيكل مُهيكل، مش من Brain وحده).
      const productModeV2 = await isProductModeV2Project(supabase, projectId, actorId);
      const structured = await getStructuredContextForPRD(projectId, supabase);
      if (productModeV2 && structured.requirements.length === 0) {
        await supabase.from("prd").update({ sync_status: "idle" }).eq("project_id", projectId);
        return { status: "missing_requirements", message: PRD_GATE_MESSAGES.missingRequirements };
      }

      const acceptedRecommendations = await getAcceptedRecommendations(supabase, projectId);
      const fused = await buildFusedKnowledgeBlock(projectId, supabase);
      const structuredBlock = formatStructuredContextForPrompt(structured);
      const prompt = buildPRDSectionRegenerationPrompt(
        brain.content,
        sectionKey,
        context,
        acceptedRecommendations,
        fused.text,
        structuredBlock
      );
      const response = await AIService.execute(AITaskType.PRD_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        await releaseLockAsFailed(supabase, projectId, response.error?.message ?? "خطأ غير معروف");
        return {
          status: "error",
          message: response.error?.message ?? "فشلت إعادة توليد القسم.",
          code: response.error?.code ?? "UNKNOWN",
        };
      }

      const validation = validatePRDSectionRegeneration(response.output, sectionKey);
      if (!validation.ok) {
        console.error(
          `[PRDGeneration] Section validation failed for project ${projectId}/${sectionKey}: ${truncateForLog(validation.reason)}`
        );
        await releaseLockAsFailed(supabase, projectId, validation.reason);
        return { status: "error", message: "لم نتمكن من فهم نتيجة إعادة التوليد.", code: "INVALID_RESPONSE" };
      }

      await applySectionRegeneration(supabase, projectId, sectionKey, validation.value, brain.version, actorId);
      return { status: "success" };
    } catch (err) {
      console.error(`[PRDGeneration] Unexpected failure regenerating ${sectionKey} for project ${projectId}:`, err);
      await releaseLockAsFailed(
        supabase,
        projectId,
        err instanceof Error ? err.message : "خطأ غير متوقع"
      );
      return { status: "error", message: "حدث خطأ غير متوقع أثناء إعادة التوليد.", code: "UNEXPECTED" };
    }
  }
}
