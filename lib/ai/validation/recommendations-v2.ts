import type {
  RecommendationCategoryV2,
  RecommendationComplexity,
  RecommendationLevel,
  RecommendationValue,
} from "@/lib/types/database";

const CATEGORIES: RecommendationCategoryV2[] = [
  "business_logic", "functional", "non_functional", "architecture", "database",
  "performance", "security", "scalability", "integration", "automation",
  "workflow", "reporting", "analytics", "notifications", "validation",
  "permissions", "compliance", "accessibility", "ux", "ui",
  "ai_enhancement", "future_expansion", "organizational_improvement",
];
const LEVELS: RecommendationLevel[] = ["critical", "high", "medium", "low"];
const VALUES: RecommendationValue[] = ["high", "medium", "low"];
const COMPLEXITIES: RecommendationComplexity[] = ["small", "medium", "large", "xlarge"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}
function indexArray(value: unknown, maxIndex: number): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const raw of value) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= maxIndex) out.push(Math.round(n));
  }
  return [...new Set(out)];
}
function levelOrNull(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

export interface RecommendationCandidateV2 {
  category: RecommendationCategoryV2;
  title: string;
  recommendation: string;
  rationale: string;
  priority: RecommendationLevel | null;
  severity: RecommendationLevel | null;
  business_value: RecommendationValue | null;
  technical_value: RecommendationValue | null;
  affected_modules: string[];
  acceptance_criteria: string[];
  implementation_notes: string;
  potential_risks: string;
  expected_benefits: string;
  estimated_complexity: RecommendationComplexity | null;
  confidence_score: number;
  supporting_project_indexes: number[];
  /** فهارس داخل نفس دفعة الرد — تتربط بـ recommendation_dependencies بعد الإدخال في القاعدة، مش قبله. */
  depends_on_indexes: number[];
}

export type RecommendationsV2ValidationResult = { ok: true; data: RecommendationCandidateV2[] } | { ok: false; reason: string };

/**
 * maxProjectIndex: -1 لو مفيش مشاريع سابقة مشابهة خالص (يبقى
 * supporting_project_indexes لازم تفضل فاضية، والاستناد المقبول الوحيد
 * هو الإشارة لمشكلة تناسق/فجوة مجال جوّه rationale نفسها — الـ Prompt
 * بيوضّح ده، الـ Validator مش بيقدر يتحقق من محتوى rationale نفسه، فبيسيب
 * القرار للـ Prompt Engineering + المراجعة البشرية بعد كده).
 *
 * depends_on_indexes بيتحقق منها بعد تجميع الدفعة كاملة (index دلوقتي
 * بيشاور على عنصر تاني **في نفس الدفعة**، مش على صف DB موجود فعليًا —
 * التحويل لـ recommendation_dependencies الحقيقية بيحصل في الخدمة بعد
 * الإدخال، مش هنا).
 */
export function validateRecommendationsV2(raw: string | null, maxProjectIndex: number): RecommendationsV2ValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.recommendations)) return { ok: false, reason: "recommendations لازم يكون مصفوفة." };

  const items: RecommendationCandidateV2[] = [];
  // كل عنصر في items ممكن يتشال لو فشل التحقق — لازم نحتفظ بفهرسه
  // الأصلي في رد الـ AI عشان depends_on_indexes (اللي بتشاور على فهارس
  // الرد الخام) تتحوّل صح لفهارس المصفوفة النهائية بعد الفلترة.
  const originalIndexOfItem: number[] = [];
  for (let i = 0; i < obj.recommendations.length; i++) {
    const raw_r = obj.recommendations[i];
    if (typeof raw_r !== "object" || raw_r === null) continue;
    const r = raw_r as Record<string, unknown>;

    if (typeof r.category !== "string" || !CATEGORIES.includes(r.category as RecommendationCategoryV2)) continue;
    if (!isNonEmptyString(r.recommendation)) continue;

    const confidenceRaw = Number(r.confidence_score);
    const confidence_score = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(100, Math.round(confidenceRaw))) : 50;

    const supporting_project_indexes = indexArray(r.supporting_project_indexes, maxProjectIndex);

    items.push({
      category: r.category as RecommendationCategoryV2,
      title: isNonEmptyString(r.title) ? r.title : (r.recommendation as string).slice(0, 80),
      recommendation: r.recommendation as string,
      rationale: isNonEmptyString(r.rationale) ? r.rationale : "",
      priority: levelOrNull(r.priority, LEVELS) as RecommendationLevel | null,
      severity: levelOrNull(r.severity, LEVELS) as RecommendationLevel | null,
      business_value: levelOrNull(r.business_value, VALUES) as RecommendationValue | null,
      technical_value: levelOrNull(r.technical_value, VALUES) as RecommendationValue | null,
      affected_modules: stringArray(r.affected_modules),
      acceptance_criteria: stringArray(r.acceptance_criteria),
      implementation_notes: isNonEmptyString(r.implementation_notes) ? r.implementation_notes : "",
      potential_risks: isNonEmptyString(r.potential_risks) ? r.potential_risks : "",
      expected_benefits: isNonEmptyString(r.expected_benefits) ? r.expected_benefits : "",
      estimated_complexity: levelOrNull(r.estimated_complexity, COMPLEXITIES) as RecommendationComplexity | null,
      confidence_score,
      supporting_project_indexes,
      depends_on_indexes: [], // يتحسب تحت بعد ما نعرف تحويل الفهارس الأصلية للفهارس النهائية
    });
    originalIndexOfItem.push(i);
  }

  // خريطة: الفهرس الأصلي في رد الـ AI → الفهرس النهائي بعد الفلترة.
  // أي depends_on_index بيشاور على عنصر اتشال أثناء التحقق بيتجاهل
  // بهدوء بدل ما يكسر التوصية كلها.
  const originalToFinalIndex = new Map(originalIndexOfItem.map((originalIdx, finalIdx) => [originalIdx, finalIdx]));
  for (let finalIdx = 0; finalIdx < items.length; finalIdx++) {
    const originalIdx = originalIndexOfItem[finalIdx];
    const raw_r = obj.recommendations[originalIdx] as Record<string, unknown>;
    const rawDependsOn = Array.isArray(raw_r.depends_on_indexes) ? raw_r.depends_on_indexes : [];
    const mapped = rawDependsOn
      .map((v) => originalToFinalIndex.get(Number(v)))
      .filter((v): v is number => v !== undefined && v !== finalIdx);
    items[finalIdx].depends_on_indexes = [...new Set(mapped)];
  }

  return { ok: true, data: items };
}
