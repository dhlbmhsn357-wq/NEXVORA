/**
 * NEXVORA Sector Standards — Impact Analysis Pipeline (0124، المرحلة ب)
 * ============================================================================
 * أوركسترا تحليل أثر طلب تغيير: من طلب تغيير خام لمقترحات change_impacts
 * (status='proposed') مبنية على بيانات المنتج الحقيقية الحالية.
 *
 * **الضمانة الأساسية (غير قابلة للتفاوض)**: الدالة دي أبدًا ما بتكتبش على
 * أي جدول بيانات منتج حقيقي (product_requirements/user_stories/
 * business_rules/...). المخرج الوحيد المسموح: صفوف change_impacts جديدة،
 * كلها status='proposed'. الكتابة الفعلية على المنتج بتحصل حصريًا في
 * apply-changes-service.ts::applyApprovedImpacts، بعد اعتماد بشري صريح.
 *
 * نفس بنية qa-pipeline.ts: خطوات منفصلة صريحة، بلا دالة واحدة ضخمة.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildImpactAnalysisPrompt } from "@/lib/ai/prompts/standard-change-impact-analysis";
import { validateImpactAnalysis } from "@/lib/ai/validation/standard-change-impact-analysis";
import { truncateForLog } from "@/lib/observability/safe-log";

import { listPersonas, listFlows, listRequirements } from "@/lib/product-definition/service";
import { listBusinessRules } from "@/lib/product-definition/business-rules-service";
import { listSystemMessages } from "@/lib/product-definition/system-messages-service";
import { listStateMachines } from "@/lib/product-definition/state-machine-service";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { getDecisionMemory } from "@/lib/organizational-intelligence/decision-memory-service";

import {
  getChangeRequest,
  updateChangeRequestStatus,
  createChangeImpacts,
} from "./change-request-service";
import type { ChangeImpactRow } from "./change-request-types";

export type RunImpactAnalysisResult =
  | { ok: true; impacts: ChangeImpactRow[] }
  | { ok: false; message: string };

/** بند سياق واحد من بيانات المنتج الحالية — كل بند بيمثّل صف واحد قابل للاستشهاد به كـ artifact_id. */
interface ContextItem {
  id: string;
  label: string;
  content: string;
}

function joinNonEmpty(parts: Array<string | null | undefined>, sep = " — "): string {
  return parts.filter((p) => p && p.trim().length > 0).join(sep);
}

function formatBlock(heading: string, items: ContextItem[]): string {
  if (items.length === 0) return `### ${heading}\n(لا يوجد عناصر حالية في هذا النطاق لهذا المشروع.)`;
  const lines = items.map((it) => `- id="${it.id}" — ${it.label}: ${it.content}`);
  return `### ${heading}\n${lines.join("\n")}`;
}

/**
 * يجمع سياق بيانات المنتج الحالية عبر كل النطاقات ذات الصلة (نفس نطاقات
 * clone-service.ts + PRD + Decisions)، منسّق بأسلوب مشابه لـ
 * project-assistant/mappers.ts لكل نطاق (مش إعادة استخدام مباشر لأن
 * الشكل المطلوب هنا مختلف: نص واحد مجمَّع للـ prompt، مش KnowledgeEntryDraft
 * فردي لكل صف).
 *
 * يرجّع النص المُنسَّق للـ prompt + مجموعة كل الـ id الحقيقية (للتحقق من
 * عدم اختراع artifact_id في validateImpactAnalysis).
 */
async function gatherCurrentProductContext(
  projectId: string
): Promise<{ formatted: string; validArtifactIds: Set<string> }> {
  const svc = createServiceClient();

  const [personas, flows, requirements, stories, acceptanceCriteria, businessRules, systemMessages, stateMachines, decisions] =
    await Promise.all([
      listPersonas(projectId),
      listFlows(projectId),
      listRequirements(projectId),
      listStories(projectId),
      listAcceptanceCriteria(projectId),
      listBusinessRules(projectId),
      listSystemMessages(projectId),
      listStateMachines(projectId),
      getDecisionMemory(projectId),
    ]);

  const { data: prd } = await svc
    .from("prd")
    .select("id, version, status, overview, problem_statement")
    .eq("project_id", projectId)
    .maybeSingle();

  const validArtifactIds = new Set<string>();
  const track = (id: string) => {
    validArtifactIds.add(id);
    return id;
  };

  const personaItems: ContextItem[] = personas.map((p) => ({
    id: track(p.id),
    label: `شخصية مستخدم${p.isPrimary ? " (أساسية)" : ""}`,
    content: joinNonEmpty([p.name, p.role, p.segment, p.jobsToBeDone, p.goals, p.pains]),
  }));

  const flowItems: ContextItem[] = flows.map((f) => ({
    id: track(f.id),
    label: `تدفق مستخدم (${f.flowType})`,
    content: joinNonEmpty([f.name, f.description, f.triggerEvent, f.successOutcome]),
  }));

  const requirementItems: ContextItem[] = requirements.map((r) => ({
    id: track(r.id),
    label: `متطلب${r.code ? ` [${r.code}]` : ""} (${r.requirementType}/${r.priority}/${r.status})`,
    content: joinNonEmpty([r.title, r.description, r.rationale]),
  }));

  const storyItems: ContextItem[] = stories.map((s) => ({
    id: track(s.id),
    label: `قصة مستخدم${s.code ? ` [${s.code}]` : ""} (${s.status})`,
    content: `بصفتي ${s.asA}، أريد ${s.iWant}، لكي ${s.soThat}.`,
  }));

  const acItems: ContextItem[] = acceptanceCriteria.map((ac) => ({
    id: track(ac.id),
    label: `معيار قبول${ac.code ? ` [${ac.code}]` : ""} (لقصة id="${ac.userStoryId}"، ${ac.status})`,
    content: `${ac.title} — بفرض ${ac.givenClause}، عندما ${ac.whenClause}، إذن ${ac.thenClause}.`,
  }));

  const businessRuleItems: ContextItem[] = businessRules.map((r) => ({
    id: track(r.id),
    label: "قاعدة عمل",
    content: joinNonEmpty([r.title, r.triggerCondition ? `الشرط: ${r.triggerCondition}` : null, r.onViolation ? `عند التجاوز: ${r.onViolation}` : null, `نقطة التطبيق: ${r.enforcementPoint}`]),
  }));

  const systemMessageItems: ContextItem[] = systemMessages.map((m) => ({
    id: track(m.id),
    label: `رسالة نظام (${m.messageType}) — الحدث "${m.eventName}"`,
    content: m.messageText,
  }));

  const stateMachineItems: ContextItem[] = stateMachines.map((sm) => ({
    id: track(sm.id),
    label: "آلة حالة",
    content: joinNonEmpty([sm.name, sm.description, `الحالات: ${(sm.states ?? []).join(", ")}`]),
  }));

  const prdItems: ContextItem[] = prd
    ? [
        {
          id: track(prd.id as string),
          label: `PRD — نسخة ${prd.version} (${prd.status})`,
          content: joinNonEmpty([prd.overview as string | null, prd.problem_statement as string | null]),
        },
      ]
    : [];

  const decisionItems: ContextItem[] = decisions.map((d) => ({
    id: track(d.id),
    label: "قرار",
    content: joinNonEmpty([d.decision_title, d.rationale ? `المبرر: ${d.rationale}` : null, `النتيجة: ${d.outcome}`]),
  }));

  const formatted = [
    formatBlock("Personas", personaItems),
    formatBlock("User Flows", flowItems),
    formatBlock("Requirements", requirementItems),
    formatBlock("User Stories", storyItems),
    formatBlock("Acceptance Criteria", acItems),
    formatBlock("Business Rules", businessRuleItems),
    formatBlock("System Messages", systemMessageItems),
    formatBlock("State Machines", stateMachineItems),
    formatBlock("PRD", prdItems),
    formatBlock("Decisions", decisionItems),
  ].join("\n\n");

  return { formatted, validArtifactIds };
}

/**
 * المدخل الرئيسي: يشغّل تحليل أثر لطلب تغيير موجود. أبدًا ما بيلمسش
 * بيانات المنتج الحقيقية — المخرج الوحيد صفوف change_impacts جديدة.
 *
 * معالجة الفشل: لو التحليل فشل (استرجاع/AI/تحقق)، حالة طلب التغيير بترجع
 * لـ 'draft' (مش تفضل عالقة على 'analyzing' للأبد) — القرار ده عمدًا:
 * 'draft' بيسمح للمستخدم يعيد المحاولة مباشرة (نفس الحالة الأولية اللي
 * بيقدر يشغّل منها runImpactAnalysis تاني)، بدل حالة فشل مخصّصة جديدة
 * كانت هتحتاج تعديل enum + معالجة UI إضافية لفايدة محدودة في المرحلة دي.
 */
export async function runImpactAnalysis(
  projectId: string,
  changeRequestId: string
): Promise<RunImpactAnalysisResult> {
  const changeRequest = await getChangeRequest(changeRequestId);
  if (!changeRequest || changeRequest.projectId !== projectId) {
    return { ok: false, message: "طلب التغيير غير موجود." };
  }

  await updateChangeRequestStatus(changeRequestId, "analyzing");

  let context: { formatted: string; validArtifactIds: Set<string> };
  try {
    context = await gatherCurrentProductContext(projectId);
  } catch (err) {
    console.error(`[ImpactAnalysis] فشل جمع سياق المنتج لمشروع ${projectId}:`, err);
    await updateChangeRequestStatus(changeRequestId, "draft");
    return { ok: false, message: "تعذّر جمع بيانات المنتج الحالية للتحليل — حاول مرة أخرى." };
  }

  const prompt = buildImpactAnalysisPrompt(changeRequest, context.formatted);

  const response = await AIService.execute(AITaskType.STANDARD_CHANGE_IMPACT_ANALYSIS, prompt, {
    projectId,
  });

  if (!response.success) {
    console.error(`[ImpactAnalysis] فشل نداء AI لطلب التغيير ${changeRequestId}: ${response.error?.code} — ${truncateForLog(response.error?.message ?? "")}`);
    await updateChangeRequestStatus(changeRequestId, "draft");
    return { ok: false, message: "تعذّر توليد تحليل الأثر حاليًا — حاول مرة أخرى." };
  }

  const validation = validateImpactAnalysis(response.output, context.validArtifactIds);
  if (!validation.ok) {
    console.error(`[ImpactAnalysis] فشل التحقق من رد التحليل لطلب التغيير ${changeRequestId}: ${truncateForLog(validation.reason)}`);
    await updateChangeRequestStatus(changeRequestId, "draft");
    return { ok: false, message: "لم نتمكن من فهم نتيجة تحليل الأثر." };
  }

  if (validation.warnings.length > 0) {
    console.warn(`[ImpactAnalysis] طلب التغيير ${changeRequestId}: ${validation.warnings.join(" | ")}`);
  }

  const impacts = await createChangeImpacts(
    changeRequestId,
    validation.data.impacts.map((i) => ({
      artifactType: i.artifactType,
      artifactId: i.artifactId,
      artifactLabel: i.artifactLabel,
      impactType: i.impactType,
      reason: i.reason,
      proposedChange: i.proposedChange,
      dependencies: i.dependencies,
      missingInformation: i.missingInformation,
    }))
  );

  await updateChangeRequestStatus(changeRequestId, "needs_review");

  return { ok: true, impacts };
}
