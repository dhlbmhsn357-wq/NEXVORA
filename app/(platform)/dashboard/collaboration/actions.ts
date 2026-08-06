"use server";

import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listMessages,
  listThreadReplies,
  sendMessage as sendMessageService,
  editMessage as editMessageService,
  deleteMessage as deleteMessageService,
  setPinned,
  toggleReaction as toggleReactionService,
  markConversationRead,
  ensureDirectConversation,
  ensureDepartmentChannel,
  ensureAnnouncementChannel,
  searchMessages,
  type MessageWithMeta,
} from "@/lib/collaboration/service";
import {
  canCreateConversation,
  canEditMessage,
  canDeleteMessage,
  canPinMessage,
  canCreateAnnouncement,
} from "@/lib/collaboration/permissions";
import { summarizeConversation, type CollaborationExtraction } from "@/lib/collaboration/summary-service";
import {
  convertMessageToBrain,
  convertMessageToSupport,
  convertMessageToTask,
} from "@/lib/collaboration/convert-service";
import { getChatAttachmentUrl } from "@/lib/storage/chat-attachments";
import type { ManualNoteType } from "@/lib/brain-v2/manual-notes";
import type { UserRole, MessagePriority } from "@/lib/types/database";

async function auth() {
  return requireRole(["owner", "admin", "supervisor", "member"]);
}

async function messageContext(messageId: string): Promise<{ authorId: string | null; conversationId: string; projectId: string | null } | null> {
  const supabase = createServiceClient();
  const { data: msg } = await supabase.from("messages").select("author_id, conversation_id").eq("id", messageId).maybeSingle();
  if (!msg) return null;
  const { data: conv } = await supabase.from("conversations").select("project_id").eq("id", msg.conversation_id).maybeSingle();
  return { authorId: msg.author_id, conversationId: msg.conversation_id, projectId: conv?.project_id ?? null };
}

export async function loadMessages(conversationId: string, beforeIso?: string): Promise<{ ok: boolean; messages: MessageWithMeta[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, messages: [] };
  await markConversationRead(conversationId, a.userId!);
  return { ok: true, messages: await listMessages(conversationId, 50, beforeIso) };
}

export async function loadThread(parentId: string): Promise<{ ok: boolean; messages: MessageWithMeta[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, messages: [] };
  return { ok: true, messages: await listThreadReplies(parentId) };
}

export async function sendMessage(input: {
  conversationId: string;
  body: string;
  parentMessageId?: string | null;
  quotedMessageId?: string | null;
  priority?: MessagePriority | null;
  attachments?: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number }[];
}): Promise<{ ok: boolean; message?: string; messageId?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };

  // الإعلانات: admin فأعلى فقط
  if (input.priority) {
    const supabase = createServiceClient();
    const { data: conv } = await supabase.from("conversations").select("type, project_id").eq("id", input.conversationId).maybeSingle();
    if (conv?.type === "announcement" && !canCreateAnnouncement(a.role as UserRole)) {
      return { ok: false, message: "الإعلانات لمسؤولي النظام والمسؤولين فقط." };
    }
  }

  const supabase = createServiceClient();
  const { data: conv } = await supabase.from("conversations").select("project_id").eq("id", input.conversationId).maybeSingle();
  return sendMessageService({
    conversationId: input.conversationId,
    authorId: a.userId!,
    body: input.body,
    parentMessageId: input.parentMessageId ?? null,
    quotedMessageId: input.quotedMessageId ?? null,
    priority: input.priority ?? null,
    attachments: (input.attachments ?? []).map((x) => ({ ...x, projectId: conv?.project_id ?? null })),
  });
}

export async function editMessage(messageId: string, newBody: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const ctx = await messageContext(messageId);
  if (!ctx) return { ok: false, message: "الرسالة غير موجودة." };
  if (!canEditMessage(a.role as UserRole, ctx.authorId, a.userId!)) return { ok: false, message: "مش مسموح تعدّل الرسالة دي." };
  return editMessageService(messageId, a.userId!, newBody);
}

export async function deleteMessage(messageId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const ctx = await messageContext(messageId);
  if (!ctx) return { ok: false, message: "الرسالة غير موجودة." };
  if (!canDeleteMessage(a.role as UserRole, ctx.authorId, a.userId!)) return { ok: false, message: "مش مسموح تحذف الرسالة دي." };
  return deleteMessageService(messageId, a.userId!);
}

export async function pinMessage(messageId: string, pinned: boolean): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canPinMessage(a.role as UserRole)) return { ok: false, message: "التثبيت للمشرفين فأعلى." };
  return setPinned(messageId, a.userId!, pinned);
}

export async function toggleReaction(messageId: string, emoji: string): Promise<{ ok: boolean }> {
  const a = await auth();
  if (!a.ok) return { ok: false };
  return toggleReactionService(messageId, a.userId!, emoji);
}

export async function startDirectConversation(otherUserId: string): Promise<{ ok: boolean; conversationId?: string; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const id = await ensureDirectConversation(a.userId!, otherUserId);
  return { ok: true, conversationId: id };
}

export async function createDepartmentChannel(department: string): Promise<{ ok: boolean; conversationId?: string; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canCreateConversation(a.role as UserRole, "department")) return { ok: false, message: "إنشاء قنوات الأقسام للمسؤولين فقط." };
  const id = await ensureDepartmentChannel(department.trim(), a.userId!);
  return { ok: true, conversationId: id };
}

export async function ensureAnnouncements(): Promise<{ ok: boolean; conversationId?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false };
  if (!canCreateConversation(a.role as UserRole, "announcement")) return { ok: false };
  const id = await ensureAnnouncementChannel(a.userId!);
  return { ok: true, conversationId: id };
}

export async function getAttachmentUrl(storagePath: string): Promise<string | null> {
  const a = await auth();
  if (!a.ok) return null;
  return getChatAttachmentUrl(storagePath);
}

export async function summarize(conversationId: string): Promise<{ ok: boolean; extraction?: CollaborationExtraction; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const supabase = createServiceClient();
  const { data: conv } = await supabase.from("conversations").select("project_id").eq("id", conversationId).maybeSingle();
  return summarizeConversation(conversationId, a.userId!, conv?.project_id ?? null);
}

export async function convertToBrain(messageId: string, noteType: ManualNoteType): Promise<{ ok: boolean; message?: string; skippedNoBrain?: boolean }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const ctx = await messageContext(messageId);
  if (!ctx || !ctx.projectId) return { ok: false, message: "التحويل لـ Brain متاح فقط لرسائل داخل قناة مشروع." };
  const supabase = createServiceClient();
  const { data: msg } = await supabase.from("messages").select("body").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, message: "الرسالة غير موجودة." };
  return convertMessageToBrain({ projectId: ctx.projectId, messageId, body: msg.body, noteType, actorId: a.userId! });
}

export async function convertToTask(messageId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const ctx = await messageContext(messageId);
  if (!ctx || !ctx.projectId) return { ok: false, message: "التحويل لمهمة متاح فقط لرسائل داخل قناة مشروع." };
  const supabase = createServiceClient();
  const { data: msg } = await supabase.from("messages").select("body").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, message: "الرسالة غير موجودة." };
  return convertMessageToTask({ projectId: ctx.projectId, messageId, body: msg.body, actorId: a.userId! });
}

export async function convertToSupport(messageId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const ctx = await messageContext(messageId);
  if (!ctx || !ctx.projectId) return { ok: false, message: "التحويل لتذكرة دعم متاح فقط لرسائل داخل قناة مشروع." };
  const supabase = createServiceClient();
  const { data: msg } = await supabase.from("messages").select("body").eq("id", messageId).maybeSingle();
  if (!msg) return { ok: false, message: "الرسالة غير موجودة." };
  return convertMessageToSupport({ projectId: ctx.projectId, messageId, body: msg.body, actorId: a.userId! });
}

export async function uploadAttachment(conversationId: string, formData: FormData): Promise<{ ok: boolean; attachment?: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number }; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, message: "لا يوجد ملف." };
  const { uploadChatAttachment } = await import("@/lib/storage/chat-attachments");
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadChatAttachment({ conversationId, fileName: file.name, mimeType: file.type || "application/octet-stream", bytes });
  if (!result.ok || !result.storagePath) return { ok: false, message: result.message };
  return { ok: true, attachment: { storagePath: result.storagePath, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: bytes.byteLength } };
}

export async function searchConversationMessages(query: string, opts?: { conversationId?: string; projectId?: string; pinnedOnly?: boolean }): Promise<{ ok: boolean; messages: MessageWithMeta[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, messages: [] };
  return { ok: true, messages: await searchMessages({ query, ...opts }) };
}
