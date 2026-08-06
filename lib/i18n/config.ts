/**
 * إعداد التدويل (i18n) — Enterprise. نظام قائم على Cookie (بدون إعادة هيكلة
 * المسارات) عشان السيرفر والعميل الاتنين يقروا اللغة، والاتجاه (RTL/LTR)
 * يتبدّل تلقائيًا. المرحلة ١: البنية + الواجهة الأساسية؛ باقي الشاشات
 * تُترجَم فوق نفس الأساس تدريجيًا.
 */

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

/** اسم الكوكي اللي بيحفظ اختيار اللغة (يقرأه السيرفر والعميل). */
export const LOCALE_COOKIE = "velora-locale";

/** اتجاه الكتابة لكل لغة. */
export function dirForLocale(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** الاسم المعروض لكل لغة (باسمها الأصلي). */
export const LOCALE_LABELS: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
};

/** يتأكد أن القيمة لغة صالحة، وإلا يرجّع الافتراضي. */
export function normalizeLocale(value: string | undefined | null): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}
