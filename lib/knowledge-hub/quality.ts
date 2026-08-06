import { KNOWLEDGE_CATEGORIES, isUsable, type KnowledgeObject } from "./model";

/**
 * محرك جودة المعرفة — **وحدة نقية**.
 *
 * ## لماذا خمسة أبعاد لا درجة واحدة
 *
 * «الجودة ٦٢٪» رقم لا يقود لأي فعل. المطلوب من المستخدم لما يشوف
 * الرقم ده هو **يعرف يعمل إيه** — والإجابة مختلفة تمامًا لو النقص في
 * التغطية (ارفع مستندات أكتر) أو في التناسق (فيه تعارضات لازم تُحسم)
 * أو في الحداثة (المعرفة قديمة ومحتاجة تحديث).
 *
 * كل بُعد بيتحسب لوحده، والدرجة الكلية متوسّط مرجّح — والوزن بيعكس
 * الأثر الحقيقي: التناسق أخطر من الحداثة، لأن معرفة متناقضة بتنتج
 * قرارات غلط، والقديمة بتنتج قرارات متأخّرة.
 */

export interface QualityInput {
  objects: KnowledgeObject[];
  /** التصنيفات التي يتوقّعها هذا المشروع — أساس قياس التغطية. */
  expectedCategories?: string[];
  /** عدد التعارضات المفتوحة من `knowledge_conflicts`. */
  openConflicts?: number;
  /** عدد الفجوات المفتوحة من `knowledge_gaps`. */
  openGaps?: number;
  now?: Date;
}

export interface QualityScore {
  overall: number;
  completeness: number;
  consistency: number;
  confidence: number;
  coverage: number;
  freshness: number;

  duplicateCount: number;
  contradictionCount: number;
  missingCount: number;

  itemCount: number;
  /** ما ينقص بالضبط — مرتَّب بالأثر، عشان يبقى قابلًا للتنفيذ. */
  weaknesses: QualityWeakness[];
}

export interface QualityWeakness {
  dimension: "completeness" | "consistency" | "confidence" | "coverage" | "freshness";
  score: number;
  message: string;
  /** ماذا يفعل المستخدم حيال ذلك. */
  action: string;
}

/**
 * الأوزان.
 *
 * التناسق أعلى وزن: معرفة متناقضة **أسوأ من غيابها** — الغياب بيبان،
 * والتناقض بينتج قرارًا واثقًا وغلط.
 *
 * الحداثة أقل وزن: معرفة قديمة لسه صالحة في الأغلب، والقِدَم مؤشّر
 * لا حكم.
 */
const WEIGHTS = {
  consistency: 0.28,
  completeness: 0.24,
  coverage: 0.20,
  confidence: 0.18,
  freshness: 0.10,
} as const;

/** المعرفة الأقدم من ده تُعتبر بايتة تمامًا في حساب الحداثة. */
const STALE_AFTER_DAYS = 180;

export function computeQuality(input: QualityInput): QualityScore {
  const now = input.now ?? new Date();
  const usable = input.objects.filter((o) => isUsable(o.status));
  const itemCount = usable.length;

  if (itemCount === 0) {
    return emptyScore(input.objects.length);
  }

  // ---------- الاكتمال ----------
  // عنصر مكتمل = له عنوان ومحتوى ذي معنى وتصنيف محدَّد.
  // المحتوى القصير جدًا مش معرفة، ده عنوان اتكتب مرتين.
  const complete = usable.filter(
    (o) => o.title.trim().length > 0 && o.content.trim().length >= 40 && o.category !== "unknown"
  ).length;
  const completeness = pct(complete, itemCount);

  // ---------- التناسق ----------
  // التكرار والتعارض بيقلّلوا التناسق. التعارض أثقل بمرتين: التكرار
  // إهدار، والتعارض خطأ محتمل في القرار.
  const duplicateCount = countDuplicates(usable);
  const contradictionCount = input.openConflicts ?? 0;
  const inconsistencyLoad = duplicateCount + contradictionCount * 2;
  const consistency = clamp(100 - Math.round((inconsistencyLoad / itemCount) * 100));

  // ---------- الثقة ----------
  const confidence = Math.round(
    usable.reduce((sum, o) => sum + o.confidence, 0) / itemCount
  );

  // ---------- التغطية ----------
  // نسبة التصنيفات المتوقَّعة اللي فيها معرفة فعلًا.
  const expected = input.expectedCategories?.length
    ? input.expectedCategories
    : DEFAULT_EXPECTED_CATEGORIES;
  const present = new Set(usable.map((o) => o.category));
  const covered = expected.filter((c) => present.has(c)).length;
  const coverage = pct(covered, expected.length);

  // ---------- الحداثة ----------
  // خطّي على مدى ستة أشهر: عنصر عمره يوم = ١٠٠، وعمره ستة أشهر = ٠.
  const freshness = Math.round(
    usable.reduce((sum, o) => {
      const ageDays = (now.getTime() - o.updatedAt.getTime()) / 86_400_000;
      return sum + clamp(100 - (ageDays / STALE_AFTER_DAYS) * 100);
    }, 0) / itemCount
  );

  const overall = Math.round(
    completeness * WEIGHTS.completeness +
      consistency * WEIGHTS.consistency +
      confidence * WEIGHTS.confidence +
      coverage * WEIGHTS.coverage +
      freshness * WEIGHTS.freshness
  );

  const dimensions = { completeness, consistency, confidence, coverage, freshness };

  return {
    overall,
    ...dimensions,
    duplicateCount,
    contradictionCount,
    missingCount: input.openGaps ?? Math.max(0, expected.length - covered),
    itemCount,
    weaknesses: describeWeaknesses(dimensions, {
      duplicateCount,
      contradictionCount,
      missingCategories: expected.filter((c) => !present.has(c)),
    }),
  };
}

/**
 * التصنيفات المتوقَّعة افتراضيًا لأي مشروع برمجي.
 *
 * مش كل الثمانية والعشرين: مشروع مايتحاسبش على غياب معرفة تسويقية.
 * دي التصنيفات اللي غيابها بيعطّل بناء المنتج فعلًا.
 */
const DEFAULT_EXPECTED_CATEGORIES = [
  "business",
  "requirements",
  "operations",
  "technical",
  "workflow",
  "ui",
] as const satisfies readonly (typeof KNOWLEDGE_CATEGORIES)[number][];

/**
 * التكرار بالبصمة أولًا، وبالعنوان المطبَّع ثانيًا.
 *
 * البصمة وحدها بتفوّت النسخ المعادة صياغتها، والعنوان وحده بيعتبر
 * عنصرين مختلفين بنفس العنوان تكرارًا. الاتنين مع بعض تقدير معقول
 * بلا تكلفة مقارنة نصّية كاملة.
 */
export function countDuplicates(objects: KnowledgeObject[]): number {
  const seenHashes = new Set<string>();
  const seenTitles = new Set<string>();
  let duplicates = 0;

  for (const object of objects) {
    const hash = object.contentHash;
    const title = normalizeTitle(object.title);

    if (hash && seenHashes.has(hash)) {
      duplicates += 1;
      continue;
    }
    if (title.length >= 8 && seenTitles.has(title)) {
      duplicates += 1;
      continue;
    }

    if (hash) seenHashes.add(hash);
    if (title.length >= 8) seenTitles.add(title);
  }

  return duplicates;
}

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, "") // التشكيل العربي
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

/** حدّ الضعف: أقل من كده يستحق أن يُعرض كإجراء مطلوب. */
const WEAK_THRESHOLD = 70;

function describeWeaknesses(
  dimensions: Record<QualityWeakness["dimension"], number>,
  facts: { duplicateCount: number; contradictionCount: number; missingCategories: string[] }
): QualityWeakness[] {
  const out: QualityWeakness[] = [];

  if (dimensions.consistency < WEAK_THRESHOLD) {
    out.push({
      dimension: "consistency",
      score: dimensions.consistency,
      message:
        facts.contradictionCount > 0
          ? `${facts.contradictionCount} تعارض مفتوح و${facts.duplicateCount} تكرار.`
          : `${facts.duplicateCount} عنصر مكرَّر.`,
      action: "احسم التعارضات ودمج المكرَّر — التناقض بينتج قرارًا واثقًا وغلط.",
    });
  }

  if (dimensions.coverage < WEAK_THRESHOLD) {
    out.push({
      dimension: "coverage",
      score: dimensions.coverage,
      message: `تصنيفات بلا أي معرفة: ${facts.missingCategories.join("، ") || "—"}.`,
      action: "ارفع مستندات تغطّي المجالات الناقصة، أو أضِف ملاحظات يدوية.",
    });
  }

  if (dimensions.completeness < WEAK_THRESHOLD) {
    out.push({
      dimension: "completeness",
      score: dimensions.completeness,
      message: "عناصر بمحتوى قصير أو بلا تصنيف.",
      action: "راجع العناصر الناقصة وأكملها أو ارفضها.",
    });
  }

  if (dimensions.confidence < WEAK_THRESHOLD) {
    out.push({
      dimension: "confidence",
      score: dimensions.confidence,
      message: "متوسّط الثقة منخفض.",
      action: "راجع العناصر منخفضة الثقة واعتمدها يدويًا لترفع درجتها.",
    });
  }

  if (dimensions.freshness < WEAK_THRESHOLD) {
    out.push({
      dimension: "freshness",
      score: dimensions.freshness,
      message: "أغلب المعرفة قديمة.",
      action: "حدّث المصادر — القِدَم مؤشّر لا حكم، لكنه يستحق نظرة.",
    });
  }

  return out.sort((a, b) => a.score - b.score);
}

function emptyScore(totalObjects: number): QualityScore {
  return {
    overall: 0,
    completeness: 0,
    consistency: 0,
    confidence: 0,
    coverage: 0,
    freshness: 0,
    duplicateCount: 0,
    contradictionCount: 0,
    missingCount: DEFAULT_EXPECTED_CATEGORIES.length,
    itemCount: 0,
    weaknesses: [
      {
        dimension: "coverage",
        score: 0,
        message:
          totalObjects === 0
            ? "مفيش أي معرفة في المشروع."
            : `${totalObjects} عنصر موجود، بس مافيش عنصر صالح للاستخدام.`,
        action: "ارفع أول مستند أو أضِف ملاحظة يدوية.",
      },
    ],
  };
}

function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return clamp(Math.round((part / whole) * 100));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export type QualityLevel = "critical" | "weak" | "fair" | "good" | "excellent";

export function qualityLevel(overall: number): QualityLevel {
  if (overall < 25) return "critical";
  if (overall < 50) return "weak";
  if (overall < 70) return "fair";
  if (overall < 85) return "good";
  return "excellent";
}

export const QUALITY_LEVEL_LABELS: Record<QualityLevel, string> = {
  critical: "حرجة",
  weak: "ضعيفة",
  fair: "مقبولة",
  good: "جيدة",
  excellent: "ممتازة",
};
