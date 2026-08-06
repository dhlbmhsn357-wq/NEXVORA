"use client";

import { useEffect } from "react";

/**
 * يحذّر المستخدم قبل إغلاق/تحديث الصفحة لو فيه تعديل غير محفوظ.
 * الاستخدام: useUnsavedChangesGuard(editing && draft !== originalValue)
 * ملحوظة: تحذير المتصفح الافتراضي مش قابل للتخصيص نصيًا (قيد من المتصفح
 * نفسه لأسباب أمنية)، لكن ظهوره كافٍ لمنع فقدان تعديل بالغلط.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
