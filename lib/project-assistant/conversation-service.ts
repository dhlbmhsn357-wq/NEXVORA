import type { SupabaseClient } from "@supabase/supabase-js";
import type { AskProjectAssistantResult } from "./qa-pipeline";

/**
 * طبقة الاستمرارية لمساعد المشروع (Phase D) — الجسر بين
 * `AskProjectAssistantResult` (Phase C، ذاكرة فقط) وجداول
 * `project_assistant_conversations/messages/message_sources` (Phase A).
 *
 * ## قرار conflictExplained
 * `conflictExplained` مش عمود في قاعدة البيانات (Phase C سابته قرار
 * Phase D عمدًا — شوف `qa-pipeline.ts`). القرار هنا: **ما بيتحفظش كبيانات
 * منفصلة خالص**. السبب: تصميم الـ prompt في Phase C (buildProjectAssistantAnswerPrompt)
 * أصلًا بيوجّه النموذج إنه لو فيه تعارض/تحديث يشرحه *نصيًا* جوّه answerText
 * نفسه ("كانت المعلومة X، اتعدّلت لـ Y…") — يعني القيمة السردية للعلم دي
 * موجودة بالفعل في المحتوى المحفوظ. إضافة عمود/حقل metadata منفصل ليها
 * كانت هتبقى تكرار بلا فايدة استعلامية حقيقية (مفيش شاشة في المواصفة
 * بتفلتر أو تعرض "المحادثات اللي فيها تعارض" بشكل منفصل). لو احتجنا لاحقًا
 * نميّزها structurally، أقرب مكان إضافتها هو عمود جديد على
 * project_assistant_messages (migration منفصلة) — مش hack داخل content.
 */

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSourceView {
  sourceId: string;
  sourceType: string;
  sourceTitle: string;
  similarity: number | null;
}

export interface MessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  answerStatus: "approved" | "documented" | "unresolved" | "not_found" | null;
  contextSourceType: string | null;
  contextSourceId: string | null;
  createdAt: string;
  sources: MessageSourceView[];
}

export interface ConversationWithMessages extends ConversationSummary {
  projectId: string;
  userId: string;
  messages: MessageView[];
}

interface ConversationRow {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  answer_status: "approved" | "documented" | "unresolved" | "not_found" | null;
  context_source_type: string | null;
  context_source_id: string | null;
  created_at: string;
}

interface MessageSourceRow {
  id: string;
  message_id: string;
  knowledge_memory_id: string | null;
  source_type: string;
  source_id: string;
  source_title: string;
  similarity: number | null;
  created_at: string;
}

/** أقصى طول لعنوان المحادثة المولَّد تلقائيًا من أول سؤال (قرار Phase D صريح: ~60 حرف يكفي للعرض في قائمة/dropdown). */
const AUTO_TITLE_MAX_CHARS = 60;

/** يبني عنوان محادثة افتراضي من نص السؤال — يقصّ لحد أقصى ويضيف "…" لو اتقصّ فعليًا. */
export function deriveConversationTitle(question: string): string {
  const trimmed = question.trim();
  if (trimmed.length <= AUTO_TITLE_MAX_CHARS) return trimmed || "محادثة جديدة";
  return `${trimmed.slice(0, AUTO_TITLE_MAX_CHARS)}…`;
}

/** ينشئ محادثة جديدة لمساعد المشروع، مربوطة بمشروع ومستخدم محدَّدين. */
export async function createConversation(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  title?: string
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("project_assistant_conversations")
    .insert({ project_id: projectId, user_id: userId, title: title?.trim() || "محادثة جديدة" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "فشل إنشاء محادثة جديدة.");
  }
  return { id: (data as { id: string }).id };
}

/** يرجّع قائمة محادثات مشروع لمستخدم معيّن، الأحدث تحديثًا أولًا. */
export async function listConversations(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from("project_assistant_conversations")
    .select("id, project_id, user_id, title, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return (data as ConversationRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** يرجّع محادثة كاملة مع رسائلها ومصادر كل رسالة، مرتَّبة زمنيًا. null لو المحادثة مش موجودة. */
export async function getConversationWithMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationWithMessages | null> {
  const { data: conversation, error: conversationError } = await supabase
    .from("project_assistant_conversations")
    .select("id, project_id, user_id, title, created_at, updated_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) return null;

  const conv = conversation as ConversationRow;

  const { data: messages, error: messagesError } = await supabase
    .from("project_assistant_messages")
    .select("id, conversation_id, role, content, answer_status, context_source_type, context_source_id, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (messagesError || !messages) {
    return { id: conv.id, projectId: conv.project_id, userId: conv.user_id, title: conv.title, createdAt: conv.created_at, updatedAt: conv.updated_at, messages: [] };
  }

  const messageRows = messages as MessageRow[];
  const messageIds = messageRows.map((m) => m.id);

  let sourcesByMessage = new Map<string, MessageSourceView[]>();
  if (messageIds.length > 0) {
    const { data: sources } = await supabase
      .from("project_assistant_message_sources")
      .select("id, message_id, knowledge_memory_id, source_type, source_id, source_title, similarity, created_at")
      .in("message_id", messageIds);

    if (sources) {
      sourcesByMessage = new Map();
      for (const row of sources as MessageSourceRow[]) {
        const list = sourcesByMessage.get(row.message_id) ?? [];
        list.push({
          sourceId: row.source_id,
          sourceType: row.source_type,
          sourceTitle: row.source_title,
          similarity: row.similarity,
        });
        sourcesByMessage.set(row.message_id, list);
      }
    }
  }

  return {
    id: conv.id,
    projectId: conv.project_id,
    userId: conv.user_id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    messages: messageRows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      answerStatus: row.answer_status,
      contextSourceType: row.context_source_type,
      contextSourceId: row.context_source_id,
      createdAt: row.created_at,
      sources: sourcesByMessage.get(row.id) ?? [],
    })),
  };
}

/**
 * يحفظ دورة سؤال/جواب كاملة: رسالة المستخدم + رسالة المساعد + مصادرها.
 *
 * لو `result.ok === false`: **برضو بنحفظ رسالة assistant** (content =
 * رسالة الخطأ الواضحة بالعربي، answer_status = null، بلا مصادر) — عشان
 * خيط المحادثة يفضل متماسك في الواجهة (المستخدم يشوف إن سؤاله اتسجّل
 * ورد عليه بوضوح إنه حصل عطل، مش يختفي السؤال بصمت). ده قرار Phase D
 * صريح مطابق لتعليمة المواصفة "don't silently drop failed turns".
 */
export async function persistAssistantExchange(
  supabase: SupabaseClient,
  conversationId: string,
  question: string,
  result: AskProjectAssistantResult,
  contextSourceType?: string | null,
  contextSourceId?: string | null
): Promise<{ userMessageId: string; assistantMessageId: string | null }> {
  const { data: userRow, error: userError } = await supabase
    .from("project_assistant_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: question,
      answer_status: null,
      context_source_type: contextSourceType ?? null,
      context_source_id: contextSourceId ?? null,
    })
    .select("id")
    .single();

  if (userError || !userRow) {
    throw new Error(userError?.message ?? "فشل حفظ سؤال المستخدم.");
  }
  const userMessageId = (userRow as { id: string }).id;

  const assistantContent = result.ok ? result.answerText : result.message;
  const assistantStatus = result.ok ? result.answerStatus : null;

  const { data: assistantRow, error: assistantError } = await supabase
    .from("project_assistant_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent,
      answer_status: assistantStatus,
    })
    .select("id")
    .single();

  if (assistantError || !assistantRow) {
    // السؤال اتحفظ فعلًا — نرجّع اللي نجح، بلا رمي استثناء يمسح الخيط كله.
    console.error(`[ProjectAssistant] Failed to persist assistant message: ${assistantError?.message}`);
    return { userMessageId, assistantMessageId: null };
  }
  const assistantMessageId = (assistantRow as { id: string }).id;

  if (result.ok && result.citations.length > 0) {
    const sourceRows = result.citations.map((c) => ({
      message_id: assistantMessageId,
      knowledge_memory_id: c.sourceId,
      source_type: c.sourceType,
      source_id: c.sourceId,
      source_title: c.sourceTitle,
      similarity: c.similarity,
    }));
    const { error: sourcesError } = await supabase.from("project_assistant_message_sources").insert(sourceRows);
    if (sourcesError) {
      console.error(`[ProjectAssistant] Failed to persist message sources: ${sourcesError.message}`);
    }
  }

  // Touch updated_at للمحادثة عشان ترتيب listConversations يعكس آخر نشاط.
  await supabase
    .from("project_assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { userMessageId, assistantMessageId };
}
