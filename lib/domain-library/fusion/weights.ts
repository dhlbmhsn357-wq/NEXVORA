/**
 * أوزان دمج المعرفة — **وحدة نقية بلا I/O**.
 *
 * ليس كل مصدر متساويًا في القوّة. قرار العميل صريح لا يُناقَش؛ اقتراح
 * الذكاء الاصطناعي مفيد لكن قابل للخطأ. الأوزان بتحوّل ده لأرقام تحكم
 * أي مصدر يفوز عند التعارض.
 */

export type FusionSource =
  | "client_decision"
  | "business_rule"
  | "meeting"
  | "document"
  | "domain_standard"
  | "org_memory"
  | "best_practice"
  | "ai_suggestion";

/**
 * الأوزان الافتراضية — مطابقة لبذور ٠٠٨١/٠٠٨٢.
 *
 * `org_memory` (الطبقة الثالثة، ٧٨) بين معيار المجال وأفضل ممارسة: خبرة
 * مؤسسية مُثبَتة أقوى من ممارسة عامة، أضعف من معيار مقصود. الافتراضي
 * هنا يضمن الوزن الصحيح حتى لو صفّ القاعدة غائب.
 */
export const DEFAULT_WEIGHTS: Record<FusionSource, number> = {
  client_decision: 100,
  business_rule: 95,
  meeting: 90,
  document: 85,
  domain_standard: 80,
  org_memory: 78,
  best_practice: 75,
  ai_suggestion: 65,
};

export const SOURCE_LABELS: Record<FusionSource, string> = {
  client_decision: "قرار العميل",
  business_rule: "قاعدة عمل",
  meeting: "اجتماع",
  document: "مستند مرفوع",
  domain_standard: "معيار المجال",
  org_memory: "الذاكرة المؤسسية",
  best_practice: "أفضل ممارسة",
  ai_suggestion: "اقتراح الذكاء الاصطناعي",
};

/** وزن مصدر غير معروف — بين أدنى وأعلى، محايد. */
const UNKNOWN_WEIGHT = 50;

/**
 * يحلّ وزن مصدر، مع أفضلية للتجاوزات (من `knowledge_fusion_weights`).
 */
export function resolveWeight(
  source: string,
  overrides: Partial<Record<string, number>> = {}
): number {
  if (overrides[source] != null) return clamp(overrides[source] as number);
  if (source in DEFAULT_WEIGHTS) return DEFAULT_WEIGHTS[source as FusionSource];
  return UNKNOWN_WEIGHT;
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source as FusionSource] ?? source;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return UNKNOWN_WEIGHT;
  return Math.max(0, Math.min(100, Math.round(n)));
}
