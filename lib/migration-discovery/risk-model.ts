import type { NormalizedSchema } from "./schema-model";
import type { DependencyReport } from "./relationship-intelligence";

/**
 * كشف المخاطر — **وحدة نقية بلا I/O**.
 *
 * يكتشف المخاطر البنيوية التي تهدّد ترحيلًا آمنًا، يصنّفها بالشدّة، ويحسب
 * درجة مخاطر عامة (٠ = بلا مخاطر، ١٠٠ = حرجة).
 */

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface Risk {
  code: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
  affectedObjects: string[];
}

export interface RiskInput {
  schema: NormalizedSchema;
  dependencies: DependencyReport;
}

const HUGE_ROW_THRESHOLD = 1_000_000;
const UNSUPPORTED_TYPES = /(blob|bytea|image|geometry|geography|sql_variant|xml|clob|ntext|variant)/i;

const SEVERITY_WEIGHT: Record<RiskSeverity, number> = { critical: 30, high: 18, medium: 9, low: 3 };

export function detectRisks({ schema, dependencies }: RiskInput): Risk[] {
  const risks: Risk[] = [];

  // مفاتيح خارجية مكسورة.
  const broken = dependencies.relationships.filter((r) => r.kind === "broken");
  if (broken.length > 0) {
    risks.push({
      code: "broken_foreign_keys",
      severity: "critical",
      title: "مفاتيح خارجية مكسورة",
      detail: `${broken.length} مفتاح خارجي يشير لجدول غير موجود — يكسر سلامة البيانات عند الترحيل.`,
      affectedObjects: [...new Set(broken.map((r) => r.from))],
    });
  }

  // مراجع دائرية.
  if (dependencies.circularChains.length > 0) {
    risks.push({
      code: "circular_references",
      severity: "high",
      title: "مراجع دائرية",
      detail: `${dependencies.circularChains.length} سلسلة علاقات دائرية — تعقّد ترتيب الترحيل.`,
      affectedObjects: [...new Set(dependencies.circularChains.flat())],
    });
  }

  // جداول بلا مفتاح أساسي.
  const noPk = schema.objects.filter((o) => o.columns.length > 0 && !o.columns.some((c) => c.isPrimaryKey));
  if (noPk.length > 0) {
    risks.push({
      code: "missing_primary_keys",
      severity: "high",
      title: "جداول بلا مفتاح أساسي",
      detail: `${noPk.length} جدول بلا مفتاح أساسي واضح — يصعّب المطابقة والترحيل التزايدي.`,
      affectedObjects: noPk.map((o) => o.name),
    });
  }

  // جداول ضخمة.
  const huge = schema.objects.filter((o) => (o.rowCount ?? 0) >= HUGE_ROW_THRESHOLD);
  if (huge.length > 0) {
    risks.push({
      code: "huge_tables",
      severity: "medium",
      title: "جداول ضخمة",
      detail: `${huge.length} جدول يتجاوز مليون صفّ — يتطلّب ترحيلًا على دفعات.`,
      affectedObjects: huge.map((o) => o.name),
    });
  }

  // أنواع غير مدعومة/معقّدة.
  const unsupported = schema.objects.filter((o) => o.columns.some((c) => UNSUPPORTED_TYPES.test(c.dataType)));
  if (unsupported.length > 0) {
    risks.push({
      code: "unsupported_types",
      severity: "medium",
      title: "أنواع بيانات معقّدة",
      detail: `${unsupported.length} جدول يحتوي أنواعًا ثنائية/معقّدة (BLOB/XML/Geometry) — تحتاج معالجة خاصة.`,
      affectedObjects: unsupported.map((o) => o.name),
    });
  }

  // أعمدة بأنواع مختلطة (تلف/عدم اتساق محتمل).
  const mixed = schema.objects.filter((o) => o.columns.some((c) => c.dataType === "mixed"));
  if (mixed.length > 0) {
    risks.push({
      code: "inconsistent_types",
      severity: "medium",
      title: "أنواع بيانات غير متسقة",
      detail: `${mixed.length} جدول به أعمدة بقيم مختلطة الأنواع — تلف أو تنسيق غير موحّد محتمل.`,
      affectedObjects: mixed.map((o) => o.name),
    });
  }

  // جداول ميتة.
  if (dependencies.deadTables.length > 0) {
    risks.push({
      code: "dead_tables",
      severity: "low",
      title: "جداول ميتة",
      detail: `${dependencies.deadTables.length} جدول فارغ بلا علاقات — قد لا يحتاج ترحيلًا.`,
      affectedObjects: dependencies.deadTables,
    });
  }

  return risks.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
}

/** درجة المخاطر ٠-١٠٠ (تتراكم بالشدّة، مسقوفة). */
export function computeRiskScore(risks: Risk[]): number {
  const raw = risks.reduce((s, r) => s + SEVERITY_WEIGHT[r.severity], 0);
  return Math.min(100, raw);
}
