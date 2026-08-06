/**
 * نموذج حزمة معرفة المجال — **وحدة نقية بلا I/O**.
 *
 * الحزمة = خبرة قياسية كاملة لنوع نظام (ERP، Hospital، CRM...). ده
 * بيعرّف أنواع البنود المرجعية وحساب جودة الحزمة.
 */

export const ITEM_TYPES = [
  "module",
  "workflow",
  "business_rule",
  "requirement",
  "risk",
  "kpi",
  "integration",
  "security",
  "permission",
  "department",
  "report",
  "api_pattern",
  "db_pattern",
  "ux_pattern",
  "best_practice",
  "sop",
  "policy",
  "architecture",
  "recommendation",
] as const;

export type DomainItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<DomainItemType, string> = {
  module: "وحدة",
  workflow: "سير عمل",
  business_rule: "قاعدة عمل",
  requirement: "متطلب مرجعي",
  risk: "مخاطرة شائعة",
  kpi: "مؤشّر أداء",
  integration: "تكامل",
  security: "أمان",
  permission: "صلاحية",
  department: "قسم",
  report: "تقرير",
  api_pattern: "نمط API",
  db_pattern: "نمط قاعدة بيانات",
  ux_pattern: "نمط واجهة",
  best_practice: "أفضل ممارسة",
  sop: "إجراء تشغيلي",
  policy: "سياسة",
  architecture: "معمار",
  recommendation: "توصية مرجعية",
};

export function itemTypeLabel(type: string): string {
  return ITEM_TYPE_LABELS[type as DomainItemType] ?? type;
}

/**
 * الأنواع الأساسية اللي حزمة «كاملة» لازم تغطّيها.
 *
 * حزمة بلا وحدات أو سير عمل أو قواعد عمل ناقصة جوهريًا مهما كثرت
 * بنودها الأخرى. التغطية بتقيس **اتّساع** الأنواع، والاكتمال بيقيس
 * **عمق** كل نوع أساسي.
 */
const CORE_TYPES: DomainItemType[] = [
  "module",
  "workflow",
  "business_rule",
  "requirement",
  "risk",
  "kpi",
  "integration",
  "security",
];

/** هدف العمق لكل نوع أساسي — العدد اللي بعده النوع «مغطّى بعمق». */
const DEPTH_TARGET = 3;

export interface PackageQuality {
  completeness: number;
  coverage: number;
  score: number;
}

/**
 * يحسب جودة الحزمة من بنودها.
 *
 * - **التغطية**: كم نوعًا أساسيًا حاضرًا (اتّساع).
 * - **الاكتمال**: قد إيه كل نوع أساسي عميق (متوسّط التشبّع).
 * - **الدرجة**: مرجّحة — التغطية ٤٥٪، الاكتمال ٥٥٪.
 */
export function computePackageQuality(items: Array<{ item_type: string }>): PackageQuality {
  const countByType = new Map<string, number>();
  for (const it of items) {
    countByType.set(it.item_type, (countByType.get(it.item_type) ?? 0) + 1);
  }

  const present = CORE_TYPES.filter((t) => (countByType.get(t) ?? 0) > 0).length;
  const coverage = Math.round((present / CORE_TYPES.length) * 100);

  const depthSum = CORE_TYPES.reduce((sum, t) => {
    const c = countByType.get(t) ?? 0;
    return sum + Math.min(1, c / DEPTH_TARGET);
  }, 0);
  const completeness = Math.round((depthSum / CORE_TYPES.length) * 100);

  const score = Math.round(coverage * 0.45 + completeness * 0.55);
  return { completeness, coverage, score };
}

export function isDomainItemType(value: unknown): value is DomainItemType {
  return typeof value === "string" && (ITEM_TYPES as readonly string[]).includes(value);
}
