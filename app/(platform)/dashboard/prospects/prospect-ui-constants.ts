/**
 * ثوابت عرض مشتركة بين الجدول وصفحة التفاصيل — لون شارة موحّد لكل حالة
 * عبر الوحدة كلها (نفس الحالة = نفس اللون في كل مكان).
 */
import type { BadgeTone } from "@/components/ui/Badge";
import {
  PROSPECT_STATUS_LABELS,
  type ProspectStatus,
  type ProspectPriority,
  type ProspectConfidence,
  type ContactOutcome,
  type ProspectActivityType,
} from "@/lib/prospecting/types";

export { PROSPECT_STATUS_LABELS };

export const STATUS_TONE: Record<ProspectStatus, BadgeTone> = {
  new: "neutral",
  needs_verification: "warning",
  ready_to_contact: "info",
  contacted: "info",
  replied: "primary",
  interested: "success",
  follow_up: "warning",
  not_fit: "neutral",
  converted: "success",
  archived: "neutral",
};

export const PRIORITY_LABELS: Record<ProspectPriority, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
};

export const PRIORITY_TONE: Record<ProspectPriority, BadgeTone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

export const CONFIDENCE_LABELS: Record<ProspectConfidence, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
};

export const CONTACT_OUTCOME_LABELS: Record<ContactOutcome, string> = {
  no_answer: "لم يرد",
  asked_for_details: "طلب تفاصيل",
  interested: "مهتم / اتفقنا على موعد",
  not_interested: "ردّ وغير مهتم",
  wrong_number: "رقم خاطئ",
};

export const CONTACT_CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "اتصال" },
  { value: "facebook", label: "Facebook" },
  { value: "email", label: "بريد" },
  { value: "visit", label: "زيارة" },
] as const;

export const ACTIVITY_TYPE_LABELS: Record<ProspectActivityType, string> = {
  imported: "استيراد",
  verified: "تحقّق",
  assigned: "إسناد",
  whatsapp_opened: "فتح واتساب",
  message_confirmed_sent: "تأكيد إرسال رسالة",
  no_answer: "لم يرد",
  replied: "ردّ",
  interested: "مهتم",
  follow_up_scheduled: "جدولة متابعة",
  not_fit: "غير مناسب",
  converted_to_lead: "تحويل إلى Lead",
  note_added: "ملاحظة",
  archived: "أرشفة",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG");
}
