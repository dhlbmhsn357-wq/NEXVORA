import { createServiceClient } from "@/lib/supabase/service";

/**
 * تخزين مرفقات المحادثات — باكت خاص (private) بروابط موقّعة، نفس نمط
 * lib/storage/support-attachments.ts. الحدود مفروضة هنا (MIME/الحجم).
 * الباكت "chat-attachments" لازم يتعمل في Supabase (Storage) كـ private.
 */

export const CHAT_BUCKET = "chat-attachments";

/** أقصى حجم للمرفق الواحد: 25MB. */
export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** أنواع مسموحة: صور، PDF، Office، نصوص، أرشيف، صوت/فيديو أساسي. */
export const ALLOWED_CHAT_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "text/",
];
export const ALLOWED_CHAT_MIME_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
]);

export function isAllowedChatMime(mime: string): boolean {
  if (ALLOWED_CHAT_MIME_EXACT.has(mime)) return true;
  return ALLOWED_CHAT_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export interface UploadChatAttachmentResult {
  ok: boolean;
  storagePath?: string;
  message?: string;
}

export async function uploadChatAttachment(params: {
  conversationId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer | Uint8Array;
}): Promise<UploadChatAttachmentResult> {
  if (params.bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
    return { ok: false, message: "حجم الملف أكبر من الحد المسموح (25MB)." };
  }
  if (!isAllowedChatMime(params.mimeType)) {
    return { ok: false, message: "نوع الملف غير مسموح." };
  }

  const supabase = createServiceClient();
  const safe = sanitizeFileName(params.fileName || "file");
  const path = `${params.conversationId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, params.bytes, { contentType: params.mimeType, upsert: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, storagePath: path };
}

/** رابط موقّع لعرض/تنزيل مرفق (صلاحية 10 دقائق). */
export async function getChatAttachmentUrl(storagePath: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(storagePath, 600);
  return data?.signedUrl ?? null;
}
