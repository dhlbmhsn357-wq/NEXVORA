import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./config";
import { getDictionary, translate, type Dictionary } from "./dictionaries";

/**
 * قراءة اللغة الحالية من الكوكي (سيرفر فقط). يُستخدم في الـ layout والصفحات
 * السيرفر عشان يضبطوا lang/dir ويجيبوا القاموس.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

/** يرجّع اللغة + القاموس + دالة t جاهزة للاستخدام في مكوّنات السيرفر. */
export async function getI18n(): Promise<{
  locale: Locale;
  dict: Dictionary;
  t: (key: string) => string;
}> {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return { locale, dict, t: (key: string) => translate(dict, key) };
}
