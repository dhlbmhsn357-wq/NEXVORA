import type { TargetType, TargetTypeDescriptor, TargetConfigCheck } from "./load-types";

/**
 * سجلّ أنواع وجهات الحمل — **نقيّ بلا I/O**. يصف كل وجهة (حقولها،
 * صيغتها، هل تحتاج سرًّا). الكتابة الفعلية في `load-run-service`.
 *
 * فلسفة العزل (نفس نمط infra-signals/connectors): وجهات الملفات تعمل
 * **اليوم** بلا أي بيانات اعتماد (تصدير قابل للتنزيل). الوجهات المباشرة
 * (postgres/rest_api) **جاهزة كإطار** وتنشط لحظة تهيئتها ببيانات الاتصال —
 * ولا تحاول أي اتصال صادر قبل ذلك.
 */

const DESCRIPTORS: Record<TargetType, TargetTypeDescriptor> = {
  sql_file: {
    key: "sql_file",
    label: "ملف SQL (INSERT)",
    realtime: false,
    needsSecret: false,
    configFields: [{ key: "onConflictDoNothing", label: "تجاهل التكرار (ON CONFLICT)", required: false }],
    secretField: null,
    format: "sql",
    description: "يُنتج سكربت INSERT جاهزًا للتشغيل على قاعدة الـ ERP الجديدة. يعمل مع أي نظام يقبل SQL.",
  },
  csv_bundle: {
    key: "csv_bundle",
    label: "حزمة CSV",
    realtime: false,
    needsSecret: false,
    configFields: [],
    secretField: null,
    format: "csv",
    description: "ملف CSV لكل كيان — لأي ERP يدعم استيراد CSV. الأبسط والأكثر توافقًا.",
  },
  postgres: {
    key: "postgres",
    label: "اتصال Postgres مباشر",
    realtime: true,
    needsSecret: true,
    configFields: [
      { key: "tablePrefix", label: "بادئة الجداول (اختياري)", required: false },
      { key: "onConflictDoNothing", label: "تجاهل التكرار", required: false },
    ],
    secretField: { key: "connectionString", label: "سلسلة اتصال Postgres" },
    format: "sql",
    description: "كتابة مباشرة في قاعدة الهدف. جاهز كإطار — ينشط عند إضافة سلسلة الاتصال (يتطلّب موصّل معزول في النشر).",
  },
  rest_api: {
    key: "rest_api",
    label: "REST API",
    realtime: true,
    needsSecret: true,
    configFields: [
      { key: "endpoint", label: "نقطة النهاية (URL، يدعم {entity})", required: true },
      { key: "authType", label: "نوع المصادقة (bearer/apikey/none)", required: false },
      { key: "authHeaderName", label: "اسم ترويسة المفتاح (لـ apikey)", required: false },
      { key: "bodyMode", label: "شكل الجسم (array/wrapped)", required: false },
      { key: "batchSize", label: "حجم الدفعة", required: false },
    ],
    secretField: { key: "apiToken", label: "رمز الوصول (API Token)" },
    format: "json",
    description: "دفع الصفوف لواجهة الـ ERP البرمجية عبر HTTP (fetch حقيقي). يمرّ عبر منطق أعمال الـ ERP — الأأمن. {entity} في الـ URL يُستبدل باسم الكيان.",
  },
  supabase: {
    key: "supabase",
    label: "قاعدة Supabase/PostgREST",
    realtime: true,
    needsSecret: true,
    configFields: [
      { key: "url", label: "رابط مشروع Supabase الهدف", required: true },
      { key: "tablePrefix", label: "بادئة الجداول (اختياري)", required: false },
      { key: "onConflict", label: "عمود التعارض (upsert، اختياري)", required: false },
      { key: "batchSize", label: "حجم الدفعة", required: false },
    ],
    secretField: { key: "serviceKey", label: "مفتاح service_role للهدف" },
    format: "json",
    description: "كتابة مباشرة في قاعدة Supabase/Postgres الهدف عبر العميل الموجود (insert/upsert على دفعات). الأنظف لو الـ ERP نفسه على Supabase.",
  },
};

export function listTargetTypes(): TargetTypeDescriptor[] {
  return Object.values(DESCRIPTORS);
}

export function describeTarget(type: string): TargetTypeDescriptor | null {
  return DESCRIPTORS[type as TargetType] ?? null;
}

export function isFileTarget(type: string): boolean {
  const d = describeTarget(type);
  return d ? !d.realtime : false;
}

/** يتحقّق من اكتمال الإعداد غير السرّي المطلوب لنوع الوجهة. */
export function validateTargetConfig(type: string, config: Record<string, unknown>): TargetConfigCheck {
  const d = describeTarget(type);
  if (!d) return { ok: false, missing: ["نوع وجهة غير معروف"] };
  const missing: string[] = [];
  for (const field of d.configFields) {
    if (field.required) {
      const v = config[field.key];
      if (v === undefined || v === null || String(v).trim() === "") missing.push(field.label);
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * هل الوجهة مُهيَّأة للكتابة المباشرة؟ وجهات الملفات: دائمًا (لا تحتاج سرًّا).
 * الوجهات المباشرة: تحتاج إعدادًا مكتملًا **و** سرًّا محفوظًا.
 */
export function isTargetConfigured(type: string, config: Record<string, unknown>, hasSecret: boolean): boolean {
  const d = describeTarget(type);
  if (!d) return false;
  if (!d.realtime) return true;
  const cfg = validateTargetConfig(type, config);
  return cfg.ok && (!d.needsSecret || hasSecret);
}
