import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAuthEvent } from "@/lib/auth/audit";
import { parseMentions, handleFromEmail } from "./mentions";
import { PROJECT_CHANNELS, channelLabel } from "./channels";
import type {
  Conversation,
  Message,
  MessageAttachment,
  MessageReaction,
  Profile,
} from "@/lib/types/database";

/**
 * خدمة Collaboration Hub — كل قراءة/كتابة للمحادثات والرسائل تمرّ من هنا
 * (service client، والصلاحيات بتتفحص في طبقة الـ Server Actions فوقها).
 */

export { PROJECT_CHANNELS, channelLabel } from "./channels";

/** ينشئ قنوات المشروع الست تلقائيًا (idempotent) لو مش موجودة. */
export async function ensureProjectChannels(projectId: string, createdBy: string | null): Promise<void> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("channel_key")
    .eq("project_id", projectId)
    .eq("type", "project");
  const have = new Set((existing ?? []).map((c) => c.channel_key));
  const missing = PROJECT_CHANNELS.filter((k) => !have.has(k));
  if (missing.length === 0) return;
  await supabase.from("conversations").insert(
    missing.map((key) => ({
      type: "project" as const,
      project_id: projectId,
      channel_key: key,
      name: channelLabel(key),
      created_by: createdBy,
    }))
  );
}

/** قنوات مشروع معيّن (للعرض داخل صفحة المشروع «المحادثات المرتبطة»). */
export async function getProjectConversations(projectId: string): Promise<Conversation[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("project_id", projectId)
    .order("channel_key");
  return (data ?? []) as Conversation[];
}

/** قنوات الأقسام + الإعلانات (متاحة للكل حسب الصلاحية). */
export async function getGlobalConversations(): Promise<Conversation[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .in("type", ["department", "announcement"])
    .order("created_at");
  return (data ?? []) as Conversation[];
}

/** المحادثات المباشرة (DM) الخاصة بمستخدم. */
export async function getDirectConversations(userId: string): Promise<Conversation[]> {
  const supabase = createServiceClient();
  const { data: memberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);
  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .in("id", ids)
    .eq("type", "direct")
    .order("last_message_at", { ascending: false });
  return (data ?? []) as Conversation[];
}

/** ينشئ (أو يرجّع) محادثة مباشرة بين مستخدمين — بدون تكرار. */
export async function ensureDirectConversation(userA: string, userB: string): Promise<string> {
  const supabase = createServiceClient();
  // ابحث عن DM فيه الاتنين
  const { data: aMems } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", userA);
  const aIds = (aMems ?? []).map((m) => m.conversation_id);
  if (aIds.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", userB)
      .in("conversation_id", aIds);
    for (const s of shared ?? []) {
      const { data: conv } = await supabase.from("conversations").select("id, type").eq("id", s.conversation_id).maybeSingle();
      if (conv?.type === "direct") return conv.id;
    }
  }
  const { data: created } = await supabase
    .from("conversations")
    .insert({ type: "direct", created_by: userA })
    .select("id")
    .single();
  const convId = created!.id;
  await supabase.from("conversation_members").insert([
    { conversation_id: convId, user_id: userA, member_role: "owner" },
    { conversation_id: convId, user_id: userB, member_role: "member" },
  ]);
  return convId;
}

/** ينشئ قناة قسم (idempotent بالاسم). */
export async function ensureDepartmentChannel(department: string, createdBy: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("type", "department")
    .eq("department", department)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("conversations")
    .insert({ type: "department", department, name: department, created_by: createdBy })
    .select("id")
    .single();
  return created!.id;
}

/** ينشئ قناة إعلانات عامة (idempotent — واحدة على مستوى المنصة). */
export async function ensureAnnouncementChannel(createdBy: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("type", "announcement")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("conversations")
    .insert({ type: "announcement", name: "إعلانات الشركة", created_by: createdBy })
    .select("id")
    .single();
  return created!.id;
}

export interface MessageWithMeta extends Message {
  author_name: string | null;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  reply_count: number;
}

/** رسائل محادثة (أحدث N، الأقدم أولًا للعرض) — بدون رسائل الـ threads الفرعية. */
export async function listMessages(conversationId: string, limit = 50, beforeIso?: string): Promise<MessageWithMeta[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("parent_message_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (beforeIso) query = query.lt("created_at", beforeIso);
  const { data: msgs } = await query;
  const messages = ((msgs ?? []) as Message[]).reverse();
  return decorateMessages(supabase, messages);
}

/** ردود thread معيّن (بالترتيب الزمني). */
export async function listThreadReplies(parentId: string): Promise<MessageWithMeta[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("parent_message_id", parentId)
    .order("created_at", { ascending: true });
  return decorateMessages(supabase, (data ?? []) as Message[]);
}

async function decorateMessages(supabase: SupabaseClient, messages: Message[]): Promise<MessageWithMeta[]> {
  if (messages.length === 0) return [];
  const ids = messages.map((m) => m.id);
  const authorIds = [...new Set(messages.map((m) => m.author_id).filter(Boolean) as string[])];

  const [{ data: authors }, { data: attachments }, { data: reactions }, { data: replyRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("message_attachments").select("*").in("message_id", ids),
    supabase.from("message_reactions").select("*").in("message_id", ids),
    supabase.from("messages").select("parent_message_id").in("parent_message_id", ids),
  ]);

  const nameById = new Map<string, string>();
  for (const a of (authors ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) {
    nameById.set(a.id, a.full_name || a.email || "مستخدم");
  }
  const replyCount = new Map<string, number>();
  for (const r of replyRows ?? []) {
    if (r.parent_message_id) replyCount.set(r.parent_message_id, (replyCount.get(r.parent_message_id) ?? 0) + 1);
  }

  return messages.map((m) => ({
    ...m,
    author_name: m.author_id ? nameById.get(m.author_id) ?? null : null,
    attachments: ((attachments ?? []) as MessageAttachment[]).filter((a) => a.message_id === m.id),
    reactions: ((reactions ?? []) as MessageReaction[]).filter((r) => r.message_id === m.id),
    reply_count: replyCount.get(m.id) ?? 0,
  }));
}

export interface SendMessageInput {
  conversationId: string;
  authorId: string;
  body: string;
  parentMessageId?: string | null;
  quotedMessageId?: string | null;
  priority?: "normal" | "high" | "urgent" | null;
  expiresAt?: string | null;
  attachments?: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number; projectId?: string | null }[];
}

/** يرسل رسالة + يخزّن المرفقات + يحلّل المنشنز ويكتبها + يحدّث آخر نشاط. */
export async function sendMessage(input: SendMessageInput): Promise<{ ok: boolean; messageId?: string; message?: string }> {
  const supabase = createServiceClient();
  const body = input.body.trim();
  if (!body && (input.attachments?.length ?? 0) === 0) {
    return { ok: false, message: "الرسالة فاضية." };
  }

  const { data: created, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      parent_message_id: input.parentMessageId ?? null,
      author_id: input.authorId,
      body,
      quoted_message_id: input.quotedMessageId ?? null,
      priority: input.priority ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, message: error?.message ?? "فشل الإرسال." };
  const messageId = created.id;

  if (input.attachments && input.attachments.length > 0) {
    await supabase.from("message_attachments").insert(
      input.attachments.map((a) => ({
        message_id: messageId,
        conversation_id: input.conversationId,
        project_id: a.projectId ?? null,
        storage_path: a.storagePath,
        file_name: a.fileName,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
      }))
    );
  }

  // منشنز → resolve users → message_mentions (المجموعات تتخزّن كنوع)
  await persistMentions(supabase, messageId, input.conversationId, body);

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", input.conversationId);
  // القارئ = المرسل: حدّث آخر قراءة له
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.authorId);

  return { ok: true, messageId };
}

async function persistMentions(supabase: SupabaseClient, messageId: string, conversationId: string, body: string): Promise<void> {
  const parsed = parseMentions(body);
  if (parsed.length === 0) return;

  const userHandles = parsed.filter((p) => p.type === "user").map((p) => p.handle!).filter(Boolean);
  const handleToId = new Map<string, string>();
  if (userHandles.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, email").neq("status", "deleted");
    for (const p of (profiles ?? []) as Pick<Profile, "id" | "email">[]) {
      const h = handleFromEmail(p.email);
      if (h) handleToId.set(h, p.id);
    }
  }

  const rows = parsed
    .map((p) => {
      if (p.type === "user") {
        const uid = p.handle ? handleToId.get(p.handle) : undefined;
        if (!uid) return null;
        return { message_id: messageId, conversation_id: conversationId, mention_type: "user" as const, mentioned_user_id: uid };
      }
      return { message_id: messageId, conversation_id: conversationId, mention_type: p.type, mentioned_user_id: null };
    })
    .filter(Boolean);
  if (rows.length > 0) await supabase.from("message_mentions").insert(rows as never);
}

/** تعديل رسالة (بيسجّل edited_at + Audit). */
export async function editMessage(messageId: string, actorId: string, newBody: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("messages")
    .update({ body: newBody.trim(), edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return { ok: false, message: error.message };
  await recordAuthEvent({ actorId, targetUserId: null, action: "message_edited", details: { message_id: messageId } });
  return { ok: true };
}

/** حذف رسالة (soft delete + Audit). */
export async function deleteMessage(messageId: string, actorId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), body: "" })
    .eq("id", messageId);
  if (error) return { ok: false, message: error.message };
  await recordAuthEvent({ actorId, targetUserId: null, action: "message_deleted", details: { message_id: messageId } });
  return { ok: true };
}

/** تثبيت/فك تثبيت رسالة (+ Audit). */
export async function setPinned(messageId: string, actorId: string, pinned: boolean): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("messages")
    .update({ is_pinned: pinned, pinned_by: pinned ? actorId : null, pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", messageId);
  if (error) return { ok: false, message: error.message };
  await recordAuthEvent({ actorId, targetUserId: null, action: pinned ? "message_pinned" : "message_unpinned", details: { message_id: messageId } });
  return { ok: true };
}

/** إضافة/إزالة تفاعل (toggle). */
export async function toggleReaction(messageId: string, userId: string, emoji: string): Promise<{ ok: boolean }> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing) {
    await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", userId).eq("emoji", emoji);
  } else {
    await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
  }
  return { ok: true };
}

/** تعليم محادثة كمقروءة للمستخدم. */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("conversation_members")
    .upsert(
      { conversation_id: conversationId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" }
    );
}

/** إضافة عضو لمحادثة (+ Audit). */
export async function addMember(conversationId: string, userId: string, actorId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("conversation_members")
    .upsert({ conversation_id: conversationId, user_id: userId }, { onConflict: "conversation_id,user_id" });
  await recordAuthEvent({
    actorId,
    targetUserId: userId,
    action: "channel_membership_changed",
    details: { conversation_id: conversationId, change: "added" },
  });
}

/** بحث نصّي في الرسائل (اختياريًا داخل محادثة/مشروع). */
export async function searchMessages(params: {
  query: string;
  conversationId?: string;
  projectId?: string;
  pinnedOnly?: boolean;
  limit?: number;
}): Promise<MessageWithMeta[]> {
  const supabase = createServiceClient();
  let q = supabase.from("messages").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(params.limit ?? 40);
  if (params.query.trim()) q = q.textSearch("body", params.query.trim(), { type: "websearch", config: "simple" });
  if (params.conversationId) q = q.eq("conversation_id", params.conversationId);
  if (params.pinnedOnly) q = q.eq("is_pinned", true);
  if (params.projectId) {
    const { data: convs } = await supabase.from("conversations").select("id").eq("project_id", params.projectId);
    const ids = (convs ?? []).map((c) => c.id);
    if (ids.length === 0) return [];
    q = q.in("conversation_id", ids);
  }
  const { data } = await q;
  return decorateMessages(supabase, (data ?? []) as Message[]);
}
