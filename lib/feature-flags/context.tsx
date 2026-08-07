"use client";

/**
 * Feature Flags Client Context
 * ============================
 *
 * الحل النقيّ لتوصيل حالة الـ flags للمكوّنات الكلاينت (Sidebar،
 * MobileNav، CommandPalette، إلخ) بدون round-trip إضافي.
 *
 * الاستخدام: Layout السيرفر يفتح Provider بحقنه قيم مسبقة (خريطة flag→bool
 * محسوبة للمستخدم الحالي). الكلاينت يقرأ عبر useFeatureFlag(name).
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

type FlagMap = Readonly<Record<string, boolean>>;

const FeatureFlagsContext = createContext<FlagMap>({});

export function FeatureFlagsProvider({
  initialFlags,
  children,
}: {
  initialFlags: FlagMap;
  children: ReactNode;
}) {
  // freeze لضمان immutability أثناء العمر
  const value = useMemo(() => Object.freeze({ ...initialFlags }), [initialFlags]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

/** يقرأ قيمة flag واحد. مفقود = false (fail-safe). */
export function useFeatureFlag(name: string): boolean {
  const flags = useContext(FeatureFlagsContext);
  return flags[name] === true;
}

/** يقرأ قائمة الـ flags المعطّلة (helper للفلترة). */
export function useDisabledFlags(): Set<string> {
  const flags = useContext(FeatureFlagsContext);
  return new Set(Object.keys(flags).filter((k) => !flags[k]));
}
