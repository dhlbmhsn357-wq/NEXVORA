import type { ManualNoteType } from "@/lib/brain-v2/manual-notes";

/**
 * أنواع التحويل المدعومة (رسالة → معرفة) — ثابت نقي بدون أي كود سيرفر،
 * عشان يتستورد بأمان في مكوّنات الكلاينت. Task/Meeting Note مؤجّلين
 * (مفيش جداول مستقبِلة بعد في خارطة الطريق).
 */
export const CONVERTIBLE_NOTE_TYPES: { type: ManualNoteType; label: string }[] = [
  { type: "decision", label: "قرار" },
  { type: "risk", label: "مخاطرة" },
  { type: "requirement", label: "متطلب" },
  { type: "action_item", label: "إجراء/مهمة" },
  { type: "idea", label: "فكرة" },
];
