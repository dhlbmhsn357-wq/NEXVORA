interface TelegramFile {
  file_id: string;
  mime_type?: string;
}

interface TelegramMessage {
  chat: { id: number };
  caption?: string;
  voice?: TelegramFile;
  audio?: TelegramFile;
  document?: TelegramFile;
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

export interface ParsedAudioMessage {
  chatId: number;
  fileId: string;
  mimeType: string;
  caption: string | null;
}

/**
 * يقرأ Update خام من Telegram ويستخرج منه ملف صوتي (voice/audio/document
 * بصيغة صوت) لو موجود. أي نوع رسالة تاني بيترجع null ويتجاهله الـ Webhook.
 */
export function extractAudioMessage(update: unknown): ParsedAudioMessage | null {
  const message = (update as TelegramUpdate)?.message;
  if (!message) return null;

  const audioFile =
    message.voice ??
    message.audio ??
    (message.document?.mime_type?.startsWith("audio/") ? message.document : undefined);

  if (!audioFile) return null;

  return {
    chatId: message.chat.id,
    fileId: audioFile.file_id,
    mimeType: audioFile.mime_type ?? "audio/ogg",
    caption: message.caption?.trim() || null,
  };
}

/**
 * يستخرج Project Code من Caption الرسالة — بيدور على نمط PRJ-XXXX
 * في أي مكان من النص، عشان يقبل "PRJ-A7X2" لوحده أو "اجتماع PRJ-A7X2".
 */
export function extractProjectCode(caption: string | null): string | null {
  if (!caption) return null;
  const match = caption.toUpperCase().match(/PRJ-[A-Z0-9]{4}/);
  return match ? match[0] : null;
}
