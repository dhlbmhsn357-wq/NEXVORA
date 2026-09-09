/**
 * قائمة مفاتيح المراحل اللي بتدعم تصدير PDF — ملف صغير بدون أي استيراد
 * Server-only (Supabase service client/محركات التوليد) عشان يكون آمن
 * للاستيراد من مكوّنات Client (زي engineering-qa-panel.tsx) بدون ما يجرّ
 * الـ Bundle بتاع الـ Server معاه. المصدر الحقيقي لمنطق الطباعة نفسه هو
 * lib/engineering-qa/print-adapter.ts (Server-only) — الملف ده بس بيكرر
 * نفس القائمة الثابتة عشان الـ Client يقدر يقرر يعرض رابط "تصدير PDF" ولا
 * لأ من غير أي Round-trip.
 */
export const PRINTABLE_STAGE_KEYS = [
  "static_code_audit",
  "security_audit",
  "database_audit",
  "architecture_audit",
  "code_quality_audit",
  "performance_audit",
  "prd_compliance_audit",
] as const;

export function isPrintableStage(stageKey: string): boolean {
  return (PRINTABLE_STAGE_KEYS as readonly string[]).includes(stageKey);
}
