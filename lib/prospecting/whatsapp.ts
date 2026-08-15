/**
 * WhatsApp — رابط مباشر فقط، بدون أي API خارجي.
 * ==================================================
 * فتح الرابط لا يعني أن الرسالة أُرسلت — راجع service.ts:
 * recordWhatsappOpened() لا يغيّر status، وconfirmMessageSent() هو
 * الوحيد الذي يحوّل الحالة إلى contacted (بعد تأكيد صريح من المستخدم).
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape أي شيء يشبه HTML في نص — احتياط دفاعي لو الرسالة المصيَّرة
 * تُعرض لاحقًا كـ HTML في مكان آخر (منع XSS). القالب نفسه نص عادي
 * (لا HTML) لكن قيم المتغيرات قد تأتي من مصدر خارجي (Excel مستورد).
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * يستبدل {{var}} placeholders بقيم من vars — لا يسمح بتنفيذ أي HTML/Script
 * من القيم (escape دفاعي). Placeholders غير موجودة في vars تُترك كما هي
 * بدون استبدال (بدل حذفها بصمت) حتى يلاحظها المستخدم في الـ UI (Part 2).
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
    const value = vars[key] ?? "";
    return escapeHtml(value);
  });
}

/** Fallback لما تكون pain_hypothesis فارغة — لا نخترع مشكلة محددة. */
export const DEFAULT_PAIN_HYPOTHESIS_FALLBACK = "بعض فرص تنظيم التسجيل والمتابعة والتشغيل";

/**
 * يبني رابط wa.me مباشر برسالة مُرمَّزة في الـ URL. الرقم يجب أن يكون
 * مطبَّعًا مسبقًا (normalizeEgyptianPhone) — بصيغة 201XXXXXXXXX بدون +.
 */
export function buildWhatsAppLink(normalizedPhone: string, message: string): string {
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
