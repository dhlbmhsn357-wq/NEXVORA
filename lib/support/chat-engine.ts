import { createServiceClient } from "@/lib/supabase/service";
import { truncateForLog } from "@/lib/observability/safe-log";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildSupportTriagePrompt } from "@/lib/ai/prompts/support-triage";
import { validateSupportTriage } from "@/lib/ai/validation/support-triage";
import { createSupportRequest } from "./request-service";
import { EscalationService } from "./escalation-service";
import { logSupportEvent } from "./observability";
import type { ConversationMessage, PRD, ProjectBrain, SupportStructuredSummary } from "@/lib/types/database";

export interface ClientDiagnostics {
  browserInfo?: Record<string, unknown>;
  environmentInfo?: Record<string, unknown>;
  recentClientErrors?: Array<{ message: string; source?: string; at: string }>;
}

const MAX_MESSAGE_CHARS = 4000;
const MAX_CUSTOMER_TURNS = 20;

const FIXED_ESCALATION_REPLY = "تم تحويل طلبك للفريق المختص وسيتم مراجعته.";
const EMPTY_MESSAGE_REPLY = "من فضلك اكتب تفاصيل مشكلتك عشان أقدر أساعدك.";
const TOO_LONG_REPLY = "الرسالة طويلة جدًا — ممكن تلخّص المشكلة في نقاط أقصر؟";

export interface SupportConverseResult {
  reply: string;
  done: boolean;
  escalated: boolean;
  requestId?: string;
}

async function getBrainOrNull(projectId: string): Promise<ProjectBrain | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("project_brain").select("*").eq("project_id", projectId).maybeSingle();
  return data as ProjectBrain | null;
}

async function getPrdOrNull(projectId: string): Promise<PRD | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  return data as PRD | null;
}

async function getProjectNameOrNull(projectId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  return data?.name ?? null;
}

/** يجمع مسارات كل المرفقات عبر المحادثة كلها (تاريخ + الرسالة الحالية). */
function collectAttachmentPaths(history: ConversationMessage[], currentAttachmentPath?: string | null): string[] {
  const paths = history
    .filter((m) => m.role === "customer" && m.attachmentPath)
    .map((m) => m.attachmentPath as string);
  if (currentAttachmentPath) paths.push(currentAttachmentPath);
  return paths;
}

async function forceEscalate(
  projectId: string,
  history: ConversationMessage[],
  message: string,
  customerIdentifier: string | null,
  reason: string,
  attachmentPath?: string | null,
  diagnostics?: ClientDiagnostics
): Promise<SupportConverseResult> {
  const supabase = createServiceClient();
  const transcript: ConversationMessage[] = [
    ...history,
    { role: "customer", content: message, created_at: new Date().toISOString(), attachmentPath: attachmentPath ?? null },
    { role: "assistant", content: FIXED_ESCALATION_REPLY, created_at: new Date().toISOString() },
  ];

  const structuredSummary: SupportStructuredSummary = {
    problem_description: message || "(بدون وصف — تصعيد تلقائي)",
    started_when: null,
    reproduction_steps: null,
    current_result: null,
    expected_result: null,
    priority: "medium",
    attachments: collectAttachmentPaths(history, attachmentPath),
  };

  const request = await createSupportRequest(supabase, {
    projectId,
    transcript,
    requestType: "unclear",
    structuredSummary,
    resolutionStatus: "escalated",
    relatedPrdSection: null,
    relatedBrainFact: null,
    customerIdentifier,
    browserInfo: diagnostics?.browserInfo,
    environmentInfo: diagnostics?.environmentInfo,
    recentClientErrors: diagnostics?.recentClientErrors,
    aiDiagnosis: { probable_cause: reason, suggested_fix: "راجع سبب التصعيد التلقائي وتاريخ المحادثة.", confidence: 100 },
  });

  await logSupportEvent(supabase, {
    eventType: "widget_error",
    projectId,
    supportRequestId: request.id,
    success: false,
    message: reason,
  });

  const projectName = (await getProjectNameOrNull(projectId)) ?? "مشروع غير معروف";
  await EscalationService.escalate(supabase, request, projectName);

  return { reply: FIXED_ESCALATION_REPLY, done: true, escalated: true, requestId: request.id };
}

/**
 * Smart Support Triage Engine — المدخل الوحيد لمحادثة الدعم. يعتمد فقط
 * على Project Brain وPRD الفعليين للمشروع (بدون تعديلهما)، ولا يفشل
 * بصمت أبدًا: أي عطل (AI Provider، بيانات ناقصة، رد غير صالح، تكرار
 * لا نهائي) بيتحوّل تلقائيًا لتصعيد بدل ما يوقف المحادثة.
 */
export class SupportChatEngine {
  static async converse(params: {
    projectId: string;
    history: ConversationMessage[];
    message: string;
    customerIdentifier: string | null;
    attachmentPath?: string | null;
    diagnostics?: ClientDiagnostics;
  }): Promise<SupportConverseResult> {
    const { projectId, history, customerIdentifier, attachmentPath, diagnostics } = params;
    const message = params.message.trim();

    if (!message) {
      return { reply: EMPTY_MESSAGE_REPLY, done: false, escalated: false };
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return { reply: TOO_LONG_REPLY, done: false, escalated: false };
    }

    const customerTurns = history.filter((m) => m.role === "customer").length;
    if (customerTurns >= MAX_CUSTOMER_TURNS) {
      return forceEscalate(
        projectId,
        history,
        message,
        customerIdentifier,
        `تجاوز الحد الأقصى لعدد الرسائل (${MAX_CUSTOMER_TURNS}) بدون اكتمال الفهم.`,
        attachmentPath,
        diagnostics
      );
    }

    const [brain, prd] = await Promise.all([getBrainOrNull(projectId), getPrdOrNull(projectId)]);
    if (!brain || !brain.summary.trim() || !prd || !prd.overview.trim()) {
      return forceEscalate(
        projectId,
        history,
        message,
        customerIdentifier,
        "مفيش Project Brain أو PRD كافيين لهذا المشروع — تعذّر تشغيل محرك الدعم.",
        attachmentPath,
        diagnostics
      );
    }

    const prompt = buildSupportTriagePrompt(brain, prd, history, message);
    const response = await AIService.execute(AITaskType.SUPPORT_TRIAGE, prompt, { projectId });

    if (!response.success) {
      return forceEscalate(
        projectId,
        history,
        message,
        customerIdentifier,
        `فشل استدعاء AI: ${response.error?.message ?? "خطأ غير معروف"}`,
        attachmentPath,
        diagnostics
      );
    }

    const validation = validateSupportTriage(response.output);
    if (!validation.ok) {
      console.error(`[SupportChatEngine] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
      return forceEscalate(
        projectId,
        history,
        message,
        customerIdentifier,
        `رد غير صالح من AI: ${validation.reason}`,
        attachmentPath,
        diagnostics
      );
    }

    const data = validation.data;
    const supabase = createServiceClient();

    // حماية دفاعية: لو الرد نفسه بينتهي بسؤال، ميتحسبش "حل نهائي" حتى لو
    // الـ AI علّمه كده — العميل لسه مستنّي يرد، فالمحادثة لازم تستمر.
    const endsWithQuestion = /[؟?]\s*$/.test(data.replyToCustomer.trim());
    const readyToResolveDirectly = data.readyToResolveDirectly && !endsWithQuestion;

    if (data.readyToEscalate) {
      const transcript: ConversationMessage[] = [
        ...history,
        { role: "customer", content: message, created_at: new Date().toISOString(), attachmentPath: attachmentPath ?? null },
        { role: "assistant", content: FIXED_ESCALATION_REPLY, created_at: new Date().toISOString() },
      ];

      const structuredSummaryWithAttachments: SupportStructuredSummary | null = data.structuredSummary
        ? { ...data.structuredSummary, attachments: collectAttachmentPaths(history, attachmentPath) }
        : null;

      const request = await createSupportRequest(supabase, {
        projectId,
        transcript,
        requestType: data.classification ?? "unclear",
        structuredSummary: structuredSummaryWithAttachments,
        resolutionStatus: "escalated",
        relatedPrdSection: data.relatedPrdSection,
        relatedBrainFact: data.relatedBrainFact,
        customerIdentifier,
        browserInfo: diagnostics?.browserInfo,
        environmentInfo: diagnostics?.environmentInfo,
        recentClientErrors: diagnostics?.recentClientErrors,
        aiDiagnosis: data.aiDiagnosis,
      });

      const projectName = (await getProjectNameOrNull(projectId)) ?? "مشروع غير معروف";
      await EscalationService.escalate(supabase, request, projectName);

      return { reply: FIXED_ESCALATION_REPLY, done: true, escalated: true, requestId: request.id };
    }

    if (readyToResolveDirectly) {
      const transcript: ConversationMessage[] = [
        ...history,
        { role: "customer", content: message, created_at: new Date().toISOString(), attachmentPath: attachmentPath ?? null },
        { role: "assistant", content: data.replyToCustomer, created_at: new Date().toISOString() },
      ];

      const request = await createSupportRequest(supabase, {
        projectId,
        transcript,
        requestType: data.classification ?? "usage_question",
        structuredSummary: null,
        resolutionStatus: "auto_resolved",
        relatedPrdSection: data.relatedPrdSection,
        relatedBrainFact: data.relatedBrainFact,
        customerIdentifier,
        browserInfo: diagnostics?.browserInfo,
        environmentInfo: diagnostics?.environmentInfo,
      });

      return { reply: data.replyToCustomer, done: true, escalated: false, requestId: request.id };
    }

    return { reply: data.replyToCustomer, done: false, escalated: false };
  }
}
