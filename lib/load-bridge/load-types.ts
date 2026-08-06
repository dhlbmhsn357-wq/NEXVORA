/**
 * أنواع جسر الحمل (Load Bridge) — إغلاق فجوة الضخّ بعد التنفيذ (0088).
 *
 * الجسر يُثبّت مخرجات التحويل المُتحقَّق منها، ويُسلسلها بصيغة جاهزة
 * للاستيراد (CSV/JSON/SQL)، ويُطابق الأعداد مع ما توقّعه التنفيذ.
 *
 * فلسفة: كل التسلسل والمطابقة **نقيّة بلا I/O** (قابلة للاختبار بلا شبكة).
 * الكتابة الفعلية (تصدير/اتصال) تعيش في الخدمات.
 */

/** صفّ مُحوَّل جاهز للحمل — مطابق لمخرَج `executeChunk` (المرحلة ٦). */
export type LoadRow = Record<string, string>;

export type LoadFormat = "json" | "csv" | "sql";

export type TargetType = "sql_file" | "csv_bundle" | "postgres" | "rest_api" | "supabase";

export type LoadMode = "export" | "direct";

export type LoadRunStatus = "pending" | "running" | "completed" | "failed" | "partial";

/** ملخّص كيان مُثبَّت (بلا الصفوف الخام — للعرض والمطابقة). */
export interface DatasetSummary {
  entity: string;
  label: string;
  rowCount: number;
  checksum: string;
  format: LoadFormat;
}

/** نتيجة مطابقة الأعداد: المتوقَّع من التنفيذ vs المُحمَّل فعليًّا. */
export interface ReconciliationEntity {
  entity: string;
  expected: number;
  loaded: number;
  match: boolean;
}

export interface ReconciliationResult {
  entities: ReconciliationEntity[];
  totalExpected: number;
  totalLoaded: number;
  mismatches: string[];
  reconciled: boolean;
}

/** بيان حزمة التصدير (يُكتب مع الحزمة — نسخة بلا بيان مجهولة). */
export interface PackageManifest {
  format: LoadFormat;
  totalEntities: number;
  totalRows: number;
  entities: DatasetSummary[];
  note: string;
}

/** وصف نوع وجهة الحمل (للواجهة والتحقّق). */
export interface TargetTypeDescriptor {
  key: TargetType;
  label: string;
  /** كتابة مباشرة عبر الشبكة (يحتاج تهيئة) أم تصدير ملف (يعمل دائمًا)؟ */
  realtime: boolean;
  needsSecret: boolean;
  /** حقول الإعداد غير السرّية المطلوبة. */
  configFields: Array<{ key: string; label: string; required: boolean }>;
  /** الحقل السرّي (لو needsSecret). */
  secretField: { key: string; label: string } | null;
  format: LoadFormat;
  description: string;
}

export interface TargetConfigCheck {
  ok: boolean;
  missing: string[];
}
