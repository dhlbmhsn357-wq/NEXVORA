import { TelegramNotificationChannel } from "./channels/telegram-channel";
import type { NotificationChannel } from "./types";

/**
 * المكان الوحيد المسموح فيه بتسجيل قنوات التنبيه الفعلية. لإضافة قناة
 * جديدة (WhatsApp مثلاً): أنشئ ملفها في channels/ وسجّلها هنا بس —
 * من غير أي تعديل في EscalationService أو أي مكان تاني.
 */
const channels: NotificationChannel[] = [new TelegramNotificationChannel()];

export function getNotificationChannels(): NotificationChannel[] {
  return channels;
}
