import { TelegramClient } from "@/lib/telegram/client";
import type { EscalationNotification, NotificationChannel, NotificationSendResult } from "../types";

/**
 * قناة تنبيه عبر Telegram — بتستخدم نفس TelegramClient الموجود لتنبيه
 * محادثة ثابتة لفريق الدعم الداخلي (مش محادثة العميل). محتاج
 * TELEGRAM_BOT_TOKEN (موجود بالفعل) وTELEGRAM_SUPPORT_CHAT_ID (جديد).
 */
export class TelegramNotificationChannel implements NotificationChannel {
  readonly name = "telegram";

  async send(notification: EscalationNotification): Promise<NotificationSendResult> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_SUPPORT_CHAT_ID;

    if (!botToken || !chatId) {
      return { ok: false, error: "TELEGRAM_BOT_TOKEN أو TELEGRAM_SUPPORT_CHAT_ID غير مُعدّين." };
    }

    const text = [
      "🚨 تصعيد طلب دعم جديد",
      `المشروع: ${notification.projectName}`,
      `العميل: ${notification.customerIdentifier ?? "غير محدد"}`,
      `نوع الطلب: ${notification.requestType}`,
      `الملخص: ${notification.summary}`,
    ].join("\n");

    try {
      const client = new TelegramClient(botToken);
      await client.sendMessage(Number(chatId), text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "فشل إرسال تنبيه Telegram." };
    }
  }
}
