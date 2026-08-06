import type { NormalizedSchema } from "./schema-model";
import type { DependencyReport } from "./relationship-intelligence";

/**
 * تقييم جودة البيانات — **وحدة نقية بلا I/O**.
 *
 * يقيس أبعاد الجودة من البنية والاعتماديات (بلا قراءة صفوف حقيقية في هذه
 * المرحلة — ما يُتاح منها بنيويًا). كل بُعد ٠-١٠٠، والدرجة العامة وزنها.
 */

export interface QualityBreakdown {
  completeness: number; // نسبة الأعمدة غير القابلة للإفراغ / المفاتيح المعرّفة
  consistency: number; // تجانس الأنواع، غياب mixed
  integrity: number; // سلامة المفاتيح الخارجية (لا broken)
  structure: number; // كل جدول له مفتاح أساسي
  overall: number;
  signals: string[];
}

export interface QualityInput {
  schema: NormalizedSchema;
  dependencies: DependencyReport;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function assessQuality({ schema, dependencies }: QualityInput): QualityBreakdown {
  const signals: string[] = [];
  const objects = schema.objects;
  const totalColumns = objects.reduce((s, o) => s + o.columns.length, 0);

  if (objects.length === 0) {
    return { completeness: 0, consistency: 0, integrity: 0, structure: 0, overall: 0, signals: ["لا توجد كائنات مُستخرَجة."] };
  }

  // Completeness: نسبة الأعمدة non-null + وجود مفاتيح.
  const nonNull = objects.reduce((s, o) => s + o.columns.filter((c) => !c.nullable).length, 0);
  const completeness = pct(nonNull, totalColumns);
  if (completeness < 40) signals.push("نسبة عالية من الأعمدة القابلة للإفراغ — قد تعني بيانات ناقصة.");

  // Consistency: نسبة الأعمدة ذات نوع محدّد (لا mixed/unknown).
  const typedCols = objects.reduce((s, o) => s + o.columns.filter((c) => c.dataType !== "mixed" && c.dataType !== "unknown").length, 0);
  const consistency = pct(typedCols, totalColumns);
  if (consistency < 60) signals.push("أعمدة بأنواع مختلطة أو غير محدّدة — تجانس ضعيف.");

  // Integrity: نسبة العلاقات السليمة من إجمالي العلاقات المرجعية.
  const refRels = dependencies.relationships.filter((r) => r.kind !== "missing");
  const brokenCount = dependencies.relationships.filter((r) => r.kind === "broken").length;
  const integrity = refRels.length === 0 ? 100 : pct(refRels.length - brokenCount, refRels.length);
  if (brokenCount > 0) signals.push(`${brokenCount} مفتاح خارجي مكسور (يشير لجدول غير موجود).`);

  // Structure: نسبة الجداول التي لها مفتاح أساسي.
  const withPk = objects.filter((o) => o.columns.some((c) => c.isPrimaryKey)).length;
  const structure = pct(withPk, objects.length);
  if (structure < 80) signals.push("جداول بلا مفتاح أساسي واضح — يصعّب الترحيل الآمن.");

  const overall = Math.round(completeness * 0.25 + consistency * 0.25 + integrity * 0.3 + structure * 0.2);

  return { completeness, consistency, integrity, structure, overall, signals };
}
