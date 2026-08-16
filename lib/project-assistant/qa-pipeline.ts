import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types/database";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildProjectAssistantAnswerPrompt, type RequesterViewpoint } from "@/lib/ai/prompts/project-assistant-qa";
import { validateProjectAssistantAnswer } from "@/lib/ai/validation/project-assistant-qa";
import { truncateForLog } from "@/lib/observability/safe-log";
import { retrieveProjectKnowledge, fetchSupersededPredecessors } from "./retrieval-service";
import type { RetrievedEntry } from "./current-truth-ranking";
import type { SourceDomain } from "./types";

/**
 * أوركسترا مساعد المشروع (Phase C) — من السؤال الخام لإجابة مبنية على
 * أدلة، بحالة صريحة واستشهادات مُتحقَّق منها. المُدخَل الوحيد المسموح
 * لأي واجهة/action تحتاج إجابة على سؤال مساعد المشروع.
 *
 * الخطوات (تطابق وصف المواصفة قسم 22، كل خطوة دالة/كتلة منفصلة عمدًا
 * عشان الملف يفضل قابل للقراءة، مش دالة واحدة ضخمة):
 *   ١) فهم السؤال — ضمنيًا جزء من الاسترجاع + نداء الإجابة، بلا نداء AI
 *      منفصل لفهم النية (over-engineering غير مبرَّر لسؤال واحد قصير).
 *   ٢+٣) نطاق الاسترجاع + المعرفة المسموح بها → retrieveProjectKnowledge
 *      (Phase B — صلاحيات + ترتيب "الحقيقة الحالية" جاهزين من هناك).
 *   ٤) سياق التعارض التاريخي → fetchSupersededPredecessors (الفجوة اللي
 *      رصدتها Phase B: is_current=true بس بترجع من الاسترجاع العادي).
 *   ٥) الترتيب جاهز بالفعل من Phase B — مفيش أي إعادة حساب هنا.
 *   ٦) بناء سياق الإجابة → buildProjectAssistantAnswerPrompt.
 *   ٧) إنتاج الإجابة → AIService.execute(PROJECT_ASSISTANT_QA).
 *   ٨) حالة الإجابة + الاستشهادات → validateProjectAssistantAnswer.
 *   ٩) رفض الادّعاءات بلا دليل → لو الاسترجاع رجّع صفر نتائج، بنتخطّى
 *      نداء الـ AI بالكامل ونرجّع not_found حتمي مباشرة (تحسين تكلفة +
 *      صحة: أرخص وأضمن من انتظار النموذج يقول الحاجة الصح بسياق فاضي).
 */

export interface AskProjectAssistantInput {
  projectId: string;
  question: string;
  requesterRole: UserRole;
  requesterViewpoint?: RequesterViewpoint;
  /** فلتر اختياري لنطاق دومينات — لـ "اسأل في السياق" (Phase D يوصّله اختياريًا). */
  domainFilter?: SourceDomain[];
}

export interface ProjectAssistantCitation {
  sourceId: string;
  sourceType: string;
  sourceTitle: string;
  similarity: number;
}

export type AskProjectAssistantResult =
  | {
      ok: true;
      answerText: string;
      answerStatus: "approved" | "documented" | "unresolved" | "not_found";
      citations: ProjectAssistantCitation[];
      conflictExplained: boolean;
    }
  | { ok: false; message: string };

const NO_INFO_AT_ALL_MESSAGE = "لا توجد معلومات كافية في المشروع لحسم هذا السؤال.";

function toCitations(ids: string[], byId: Map<string, RetrievedEntry>): ProjectAssistantCitation[] {
  const citations: ProjectAssistantCitation[] = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) continue; // اتقصّت بالفعل في validateProjectAssistantAnswer، دي حماية إضافية بس.
    citations.push({
      sourceId: entry.id,
      sourceType: entry.objectType,
      sourceTitle: entry.sourceTitle || entry.title,
      similarity: entry.similarity,
    });
  }
  return citations;
}

/**
 * المدخل الرئيسي: بيسأل مساعد المشروع سؤالًا ويرجّع إجابة مبنية على أدلة
 * فقط، أو رسالة خطأ واضحة بالعربية (أبدًا رمي استثناء أو dump خام لخطأ
 * تقني للمستخدم النهائي).
 */
export async function askProjectAssistant(
  supabase: SupabaseClient,
  input: AskProjectAssistantInput
): Promise<AskProjectAssistantResult> {
  // ٢+٣) نطاق الاسترجاع + المعرفة المسموح بها — Phase B كامل (صلاحيات + ترتيب).
  const retrieval = await retrieveProjectKnowledge(supabase, {
    projectId: input.projectId,
    question: input.question,
    requesterRole: input.requesterRole,
    domainFilter: input.domainFilter,
  });

  if (!retrieval.ok) {
    // ملاحظة تشخيصية مؤقتة: بنضيف نص الخطأ الفعلي بين قوسين عشان تشخيص
    // أول ظهور لعطل الـ embedding بدقة بدون الحاجة لسجلات السيرفر. لو
    // اتأكد السبب واستقر، نرجّع الرسالة لصيغتها العامة النظيفة.
    const detail = truncateForLog(retrieval.error.message);
    const message =
      retrieval.error.code === "EMBEDDING_FAILED"
        ? `تعذّر فهم السؤال حاليًا (فشل توليد embedding — ${detail}) — حاول مرة أخرى.`
        : `تعذّر الوصول لمعرفة المشروع حاليًا (${detail}) — حاول مرة أخرى.`;
    console.error(`[ProjectAssistant] retrieval failed for project ${input.projectId}: ${retrieval.error.code} — ${detail}`);
    return { ok: false, message };
  }

  const entries = retrieval.entries;

  // ٩) رفض الادّعاءات بلا دليل — صفر نتائج = not_found حتمي، بلا نداء AI.
  if (entries.length === 0) {
    return {
      ok: true,
      answerText: NO_INFO_AT_ALL_MESSAGE,
      answerStatus: "not_found",
      citations: [],
      conflictExplained: false,
    };
  }

  // ٤) سياق التعارض التاريخي — استعلام مستهدف واحد، بنفس بوابة الصلاحيات
  // المستخدمة في الاسترجاع الرئيسي (member أبدًا ما يشوفش confidential).
  const excludeConfidential = input.requesterRole === "member";
  const predecessorsByTarget = await fetchSupersededPredecessors(supabase, entries, excludeConfidential);
  const supersededContext: RetrievedEntry[] = Array.from(predecessorsByTarget.values()).flat();

  // ٦) بناء سياق الإجابة.
  const prompt = buildProjectAssistantAnswerPrompt(
    input.question,
    entries,
    supersededContext,
    input.requesterRole,
    input.requesterViewpoint ?? "general"
  );

  // ٧) إنتاج الإجابة.
  const response = await AIService.execute(AITaskType.PROJECT_ASSISTANT_QA, prompt, {
    projectId: input.projectId,
  });

  if (!response.success) {
    console.error(`[ProjectAssistant] AI call failed for project ${input.projectId}: ${response.error?.code} — ${truncateForLog(response.error?.message ?? "")}`);
    return { ok: false, message: "تعذّر توليد إجابة حاليًا — حاول مرة أخرى." };
  }

  // ٨) حالة الإجابة + الاستشهادات — تحقّق حقيقي، مش ثقة عمياء في مخرجات النموذج.
  const validSourceIds = new Set<string>([...entries.map((e) => e.id), ...supersededContext.map((e) => e.id)]);
  const validation = validateProjectAssistantAnswer(response.output, validSourceIds);

  if (!validation.ok) {
    console.error(`[ProjectAssistant] Validation failed for project ${input.projectId}: ${truncateForLog(validation.reason)}`);
    return { ok: false, message: "لم نتمكن من فهم نتيجة التوليد." };
  }

  if (validation.warnings.length > 0) {
    console.warn(`[ProjectAssistant] project ${input.projectId}: ${validation.warnings.join(" | ")}`);
  }

  const byId = new Map<string, RetrievedEntry>([
    ...entries.map((e) => [e.id, e] as const),
    ...supersededContext.map((e) => [e.id, e] as const),
  ]);

  return {
    ok: true,
    answerText: validation.data.answerText,
    answerStatus: validation.data.answerStatus,
    citations: toCitations(validation.data.citedSourceIds, byId),
    conflictExplained: validation.data.conflictExplained,
  };
}
