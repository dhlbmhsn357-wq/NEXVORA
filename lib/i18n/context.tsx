"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, dirForLocale, type Locale } from "./config";
import { translate, type Dictionary } from "./dictionaries";

/**
 * سياق اللغة على العميل — بيتغذّى من السيرفر (layout) بـ locale + dict.
 * بيوفّر: useT() للترجمة، useLocale() للغة الحالية، setLocale() للتبديل
 * (بيكتب الكوكي + بيحدّث html + refresh عشان السيرفر يعيد الرسم بالاتجاه
 * والقاموس الجديد).
 */

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  t: (key: string) => string;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      // كوكي سنة كاملة عشان السيرفر يقراه في كل طلب.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      // تحديث فوري للاتجاه/اللغة قبل ما الـ refresh يخلص (إحساس أسرع).
      document.documentElement.lang = next;
      document.documentElement.dir = dirForLocale(next);
      router.refresh();
    },
    [locale, router]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dict, t: (key: string) => translate(dict, key), setLocale }),
    [locale, dict, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // fallback آمن لو مكوّن اتحطّ برّه الـ Provider (بيرجّع المفتاح نفسه).
    return {
      locale: "ar",
      dict: {},
      t: (key: string) => key,
      setLocale: () => {},
    };
  }
  return ctx;
}

/** دالة الترجمة داخل مكوّنات العميل: const t = useT(); t("nav.overview") */
export function useT(): (key: string) => string {
  return useLocaleContext().t;
}

/** اللغة الحالية + دالة التبديل. */
export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void } {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}
