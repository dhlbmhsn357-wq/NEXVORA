"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { rebuildProjectKnowledge, type RebuildOutcome } from "@/lib/project-assistant/knowledge-ingestion";
import { askProjectAssistant, type ProjectAssistantCitation } from "@/lib/project-assistant/qa-pipeline";
import {
  createConversation,
  listConversations,
  getConversationWithMessages,
  persistAssistantExchange,
  deriveConversationTitle,
  type ConversationSummary,
  type ConversationWithMessages,
} from "@/lib/project-assistant/conversation-service";
import type { RequesterViewpoint } from "@/lib/ai/prompts/project-assistant-qa";
import { DOMAIN_OBJECT_TYPE, type SourceDomain } from "@/lib/project-assistant/types";
import type { UserRole } from "@/lib/types/database";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };

/**
 * كل أدوار المنظمة الأربعة تقدر تسأل مساعد المشروع — الفلترة الحقيقية
 * (السرّية/confidential) بتحصل *جوّه* retrieveProjectKnowledge (Phase B)،
 * مش بمنع member من التبويب أو الـ action نفسها. requireRole هنا غرضها
 * الوحيد: التأكد إن فيه مستخدم مسجّل دخول بحساب نشط، وجلب دوره الحقيقي
 * من السيرفر (مُطلقًا مش من مدخل عميل) عشان نمرّره لـ askProjectAssistant.
 */
const ALL_ROLES: UserRole[] = ["owner", "admin", "supervisor", "member"];

/**
 * ملاحظة على نطاق الوصول للمشروع (قسم "Case 5" في المواصفة): الكودبيز ده
 * single-tenant بالكامل بلا جدول عضوية على مستوى مشروع (project_members) —
 * نفس القاعدة المتّبعة في كل الـ Server Actions التانية جوّه هذا المجلد
 * (evidence-actions.ts، task-actions.ts، definition-actions.ts…): أي
 * مستخدم مسجّل دخول بدوره التنظيمي الكافي عنده وصول لأي مشروع. مفيش هنا
 * أي فحص إضافي "هل هذا المستخدم عضو في هذا المشروع تحديدًا" لأنه ببساطة
 * مش موجود في نموذج الصلاحيات الحالي لأي تبويب تاني — إضافته هنا بس
 * كانت هتخالف الاتساق مع بقية النظام، مش تحسين أمان حقيقي.
 */
async function guard(): Promise<{ ok: true; userId: string; role: UserRole } | { ok: false; message: string }> {
  const gate = await requireRole(ALL_ROLES);
  if (!gate.ok || !gate.userId || !gate.role) {
    return { ok: false, message: gate.message ?? "غير مصرَّح" };
  }
  return { ok: true, userId: gate.userId, role: gate.role };
}

/**
 * إعادة بناء فهرس مساعد المشروع بالكامل (Phase A) — الحل الاحتياطي
 * الآمن "أصلح الفهرس من غير ما تلمس المصدر". Idempotent، وآمن يتكرّر.
 *
 * مش عملية member — إعادة الفهرسة بتستهلك نداءات embedding حقيقية،
 * فمحصورة بـ owner/admin/supervisor.
 */
export async function rebuildProjectKnowledgeAction(projectId: string): Promise<Result<RebuildOutcome>> {
  const g = await requireRole(["owner", "admin", "supervisor"]);
  if (!g.ok) return { ok: false, message: g.message ?? "غير مصرَّح" };

  try {
    const outcome = await rebuildProjectKnowledge(projectId);
    return { ok: true, data: outcome };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشلت إعادة بناء فهرس المعرفة." };
  }
}

// ============================================================
// Phase D — محادثة + سؤال/جواب + أسئلة مفتوحة + ملخّص المعرفة
// ============================================================

export interface AskProjectAssistantActionResult {
  conversationId: string;
  answerText: string;
  answerStatus: "approved" | "documented" | "unresolved" | "not_found" | null;
  citations: ProjectAssistantCitation[];
  assistantMessageId: string | null;
}

/**
 * best-effort: تحويل contextSourceType (نص خام جاي من نقطة دخول "اسأل في
 * السياق") لمصفوفة SourceDomain لتضييق الاسترجاع. contextSourceType ممكن
 * يكون object_type (زي 'user_story') أو SourceDomain نفسه (زي
 * 'meeting_decision') — بنجرّب الاتنين. لو مفيش تطابق، بنرجّع undefined
 * (يعني: السياق بيتحفظ للعرض بس، من غير ما يضيّق الاسترجاع — أأمن من
 * تضييق خاطئ يمنع نتائج صحيحة).
 */
function mapContextSourceTypeToDomainFilter(contextSourceType?: string): SourceDomain[] | undefined {
  if (!contextSourceType) return undefined;

  // 1) تطابق مباشر كـ SourceDomain.
  if (contextSourceType in DOMAIN_OBJECT_TYPE) {
    return [contextSourceType as SourceDomain];
  }

  // 2) تطابق عكسي: contextSourceType هو object_type، نلاقي كل SourceDomain
  //    اللي بيوصّل لنفس object_type ده.
  const matches = (Object.entries(DOMAIN_OBJECT_TYPE) as [SourceDomain, string][])
    .filter(([, objectType]) => objectType === contextSourceType)
    .map(([domain]) => domain);

  return matches.length > 0 ? matches : undefined;
}

/**
 * السؤال الرئيسي — بيسأل مساعد المشروع، يحفظ الدورة كاملة، ويرجّع نتيجة
 * جاهزة للعرض. لو `conversationId` مش ممرَّر، بينشئ محادثة جديدة بعنوان
 * مشتق من أول ~60 حرف من السؤال.
 *
 * requesterRole بيتاخد حصريًا من `requireRole` (مصدر خادمي وحيد) — أبدًا
 * مش بيتقبل كمدخل من العميل، عشان بوابة الصلاحيات جوّه retrieval (Phase B)
 * تفضل موثوقة بغضّ النظر عمّا يرسله العميل.
 */
export async function askProjectAssistantAction(
  projectId: string,
  question: string,
  conversationId?: string,
  requesterViewpoint?: RequesterViewpoint,
  contextSourceType?: string,
  contextSourceId?: string
): Promise<Result<AskProjectAssistantActionResult>> {
  const g = await guard();
  if (!g.ok) return { ok: false, message: g.message };

  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) return { ok: false, message: "الرجاء كتابة سؤال." };
  if (!projectId) return { ok: false, message: "المشروع غير محدَّد." };

  const supabase = createServiceClient();

  try {
    let convId = conversationId;
    if (!convId) {
      const created = await createConversation(supabase, projectId, g.userId, deriveConversationTitle(trimmedQuestion));
      convId = created.id;
    }

    const domainFilter = mapContextSourceTypeToDomainFilter(contextSourceType);

    const result = await askProjectAssistant(supabase, {
      projectId,
      question: trimmedQuestion,
      requesterRole: g.role, // ← من requireRole فقط، أبدًا من مدخل عميل.
      requesterViewpoint,
      domainFilter,
    });

    const { assistantMessageId } = await persistAssistantExchange(
      supabase,
      convId,
      trimmedQuestion,
      result,
      contextSourceType ?? null,
      contextSourceId ?? null
    );

    revalidatePath(`/dashboard/projects/${projectId}`);

    if (!result.ok) {
      // برضو نرجّع conversationId عشان الواجهة تقدر تكمل نفس الخيط —
      // الرسالة اتحفظت بالفعل (persistAssistantExchange مبتسقطش الأدوار الفاشلة).
      return {
        ok: true,
        data: {
          conversationId: convId,
          answerText: result.message,
          answerStatus: null,
          citations: [],
          assistantMessageId,
        },
      };
    }

    return {
      ok: true,
      data: {
        conversationId: convId,
        answerText: result.answerText,
        answerStatus: result.answerStatus,
        citations: result.citations,
        assistantMessageId,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "تعذّر معالجة السؤال حاليًا." };
  }
}

export async function listConversationsAction(projectId: string): Promise<Result<ConversationSummary[]>> {
  const g = await guard();
  if (!g.ok) return { ok: false, message: g.message };
  if (!projectId) return { ok: false, message: "المشروع غير محدَّد." };

  try {
    const supabase = createServiceClient();
    const data = await listConversations(supabase, projectId, g.userId);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل تحميل المحادثات." };
  }
}

export async function getConversationAction(conversationId: string): Promise<Result<ConversationWithMessages>> {
  const g = await guard();
  if (!g.ok) return { ok: false, message: g.message };
  if (!conversationId) return { ok: false, message: "المحادثة غير محدَّدة." };

  try {
    const supabase = createServiceClient();
    const data = await getConversationWithMessages(supabase, conversationId);
    if (!data) return { ok: false, message: "المحادثة غير موجودة." };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل تحميل المحادثة." };
  }
}

/**
 * "تحويل إلى سؤال مفتوح" — بيتاح فقط لإجابات unresolved/not_found (الفحص
 * الفعلي على الحالة ده مسؤولية الواجهة؛ هنا بنثق في messageId + questionText
 * الممرَّرين ونربطهم بالسؤال المفتوح بلا افتراضات إضافية عن answer_status
 * الحالي، عشان مفيش فايدة أمنية من إعادة الفحص هنا — أسوأ حالة ممكنة هي
 * سؤال مفتوح زيادة عن سؤال كان أصلًا محسوم، مش ثغرة صلاحيات).
 */
export async function convertToOpenQuestionAction(
  messageId: string,
  questionText: string
): Promise<Result<{ questionId: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, message: g.message };

  const trimmed = questionText.trim();
  if (!trimmed) return { ok: false, message: "نص السؤال مطلوب." };
  if (!messageId) return { ok: false, message: "الرسالة غير محدَّدة." };

  try {
    const supabase = createServiceClient();

    const { data: messageRow, error: messageError } = await supabase
      .from("project_assistant_messages")
      .select("id, conversation_id")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError || !messageRow) return { ok: false, message: "الرسالة غير موجودة." };

    const { data: conversationRow, error: conversationError } = await supabase
      .from("project_assistant_conversations")
      .select("id, project_id")
      .eq("id", (messageRow as { conversation_id: string }).conversation_id)
      .maybeSingle();

    if (conversationError || !conversationRow) return { ok: false, message: "تعذّر تحديد المشروع المرتبط." };

    const projectId = (conversationRow as { project_id: string }).project_id;

    const { data: inserted, error: insertError } = await supabase
      .from("project_open_questions")
      .insert({
        project_id: projectId,
        question: trimmed,
        source: "assistant",
        conversation_id: (conversationRow as { id: string }).id,
        message_id: messageId,
        status: "open",
        created_by: g.userId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { ok: false, message: insertError?.message ?? "فشل إنشاء سؤال مفتوح." };
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { questionId: (inserted as { id: string }).id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل تحويل السؤال." };
  }
}

export interface OpenQuestionView {
  id: string;
  question: string;
  status: "open" | "resolved";
  createdAt: string;
}

/** يرجّع الأسئلة المفتوحة المرتبطة بمشروع (لعرض "أسئلة مفتوحة من هذا المشروع (N)"). */
export async function listOpenQuestionsAction(projectId: string): Promise<Result<OpenQuestionView[]>> {
  const g = await guard();
  if (!g.ok) return { ok: false, message: g.message };
  if (!projectId) return { ok: false, message: "المشروع غير محدَّد." };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("project_open_questions")
      .select("id, question, status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, message: error.message };

    return {
      ok: true,
      data: ((data ?? []) as { id: string; question: string; status: "open" | "resolved"; created_at: string }[]).map((r) => ({
        id: r.id,
        question: r.question,
        status: r.status,
        createdAt: r.created_at,
      })),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل تحميل الأسئلة المفتوحة." };
  }
}

// ============================================================
// ملخّص المعرفة لعرض الحالة الفارغة ("المعرفة الحالية مبنية على N…")
// ============================================================

export interface KnowledgeSummaryItem {
  domain: string; // object_type الخام — يُستخدم كمفتاح فلترة/مطابقة.
  label: string; // تسمية عربية للعرض.
  count: number;
}

/** تسميات عرض عربية لكل object_type مفهرس في knowledge_memory (مصادر مساعد المشروع + الأصلية من 0078). */
const DOMAIN_LABELS: Record<string, string> = {
  discovery: "Discovery",
  meeting: "الاجتماعات",
  decision: "القرارات",
  prd_section: "PRD",
  user_story: "القصص",
  acceptance_criteria: "معايير القبول",
  requirement: "تعريف المنتج",
  prototype_review: "مراجعة النموذج",
  client_approval: "اعتماد العميل",
  handoff_item: "حزمة التسليم",
  business_rule: "قواعد العمل",
  brain: "الدماغ",
  persona: "الشخصيات",
  user_flow: "تدفقات المستخدم",
  evidence: "الأدلة",
  risk: "المخاطر",
  evaluation_scenario: "سيناريوهات التقييم",
  commercial: "التجاري",
  task: "المهام",
  open_question: "أسئلة مفتوحة",
  system_message: "رسائل النظام",
  entity: "كيانات",
  workflow: "سير العمل",
  item: "عناصر",
};

/**
 * ملخّص خفيف لعدد عناصر المعرفة الحالية (is_current=true) مجمّعة حسب
 * object_type — يغذّي الحالة الفارغة في الواجهة. استعلام واحد بسيط،
 * التجميع بيتم في التطبيق (بديل عن .rpc مخصّصة غير ضرورية لحجم بيانات
 * المشروع المتوقّع).
 */
export async function getProjectKnowledgeSummaryAction(projectId: string): Promise<Result<KnowledgeSummaryItem[]>> {
  const g = await guard();
  if (!g.ok) return { ok: false, message: g.message };
  if (!projectId) return { ok: false, message: "المشروع غير محدَّد." };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("knowledge_memory")
      .select("object_type")
      .eq("project_id", projectId)
      .eq("is_current", true);

    if (error) return { ok: false, message: error.message };

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { object_type: string }[]) {
      counts.set(row.object_type, (counts.get(row.object_type) ?? 0) + 1);
    }

    const items: KnowledgeSummaryItem[] = Array.from(counts.entries())
      .map(([domain, count]) => ({ domain, label: DOMAIN_LABELS[domain] ?? domain, count }))
      .sort((a, b) => b.count - a.count);

    return { ok: true, data: items };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل تحميل ملخّص المعرفة." };
  }
}
