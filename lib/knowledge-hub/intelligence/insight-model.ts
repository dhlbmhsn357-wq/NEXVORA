/**
 * نموذج الرؤى الاستشارية — **وحدة نقية بلا I/O**.
 *
 * ده العقد بين مخرَج المستشار (حتمي + ذكاء اصطناعي) وجدول
 * `knowledge_insights`. بيعرّف الأنواع والشدّة ومصفوفة الأولوية ومفتاح
 * إزالة التكرار.
 */

export const INSIGHT_TYPES = [
  "missing_capability",
  "contradiction",
  "risk_prediction",
  "optimization",
  "architecture",
  "business_process",
  "recommendation",
  "opportunity",
] as const;

export type InsightType = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  missing_capability: "قدرة ناقصة",
  contradiction: "تعارض",
  risk_prediction: "مخاطرة متوقَّعة",
  optimization: "تحسين",
  architecture: "اقتراح معماري",
  business_process: "عملية أعمال",
  recommendation: "توصية",
  opportunity: "فرصة",
};

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
  info: "معلومة",
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export interface InsightSourceRef {
  type: string; // requirement · risk · decision · conflict · gap · workflow · entity · rule
  id?: string;
  quote?: string;
}

export interface Insight {
  insightType: InsightType;
  title: string;
  detail: string;
  rationale: string;
  impact: string;
  module: string | null;
  severity: Severity;
  effort: number; // 0–100
  confidence: number; // 0–100
  sourceRefs: InsightSourceRef[];
}

// ============================================================
// مصفوفة الأولوية — قيمة × جهد
// ============================================================

export type PriorityQuadrant = "quick_win" | "major_project" | "fill_in" | "reconsider";

export const QUADRANT_LABELS: Record<PriorityQuadrant, string> = {
  quick_win: "مكسب سريع", // قيمة عالية · جهد منخفض
  major_project: "مشروع كبير", // قيمة عالية · جهد عالٍ
  fill_in: "وقت الفراغ", // قيمة منخفضة · جهد منخفض
  reconsider: "أعِد النظر", // قيمة منخفضة · جهد عالٍ
};

/**
 * يصنّف الرأي في ربع مصفوفة الأولوية.
 *
 * القيمة مشتقّة من الشدّة (الأعلى = أعلى قيمة)، والجهد من `effort`.
 * الحدّ عند المنتصف. ده اللي بيحوّل قائمة رؤى مسطّحة لخطة عمل: ابدأ
 * بالمكاسب السريعة، خطّط للمشاريع الكبيرة، أجّل الباقي.
 */
export function priorityQuadrant(severity: Severity, effort: number): PriorityQuadrant {
  const highValue = SEVERITY_WEIGHT[severity] >= 3; // medium فأعلى
  const highEffort = effort >= 50;

  if (highValue && !highEffort) return "quick_win";
  if (highValue && highEffort) return "major_project";
  if (!highValue && !highEffort) return "fill_in";
  return "reconsider";
}

/**
 * درجة ترتيب مركّبة — للفرز داخل اللوحة.
 *
 * الشدّة تسيطر (×20)، والجهد المنخفض يرفع قليلًا (المكسب السريع يتصدّر
 * بين نفس الشدّة)، والثقة تكسر التعادل.
 */
export function insightRank(insight: Pick<Insight, "severity" | "effort" | "confidence">): number {
  return (
    SEVERITY_WEIGHT[insight.severity] * 20 +
    (100 - insight.effort) * 0.1 +
    insight.confidence * 0.05
  );
}

/**
 * مفتاح إزالة التكرار — نصّ قانوني ثابت.
 *
 * نفس النوع + عنوان مطبَّع = نفس الرأي، فالتوليد المتكرّر يحدّث لا
 * يضاعف. التطبيع العربي شرط: «صلاحيات» و«الصلاحيات» رأي واحد.
 */
export function insightDedupeKey(insight: Pick<Insight, "insightType" | "title">): string {
  const normalized = insight.title
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${insight.insightType}::${normalized}`;
}

export function isInsightType(value: unknown): value is InsightType {
  return typeof value === "string" && (INSIGHT_TYPES as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}
