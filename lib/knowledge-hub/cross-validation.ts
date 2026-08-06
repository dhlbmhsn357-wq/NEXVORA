import type { BrainContent, BrainSectionKey } from "@/lib/brain-v2/types";
import { BRAIN_SECTIONS } from "@/lib/brain-v2/types";
import {
  CANDIDATE_THRESHOLD,
  DUPLICATE_THRESHOLD,
  itemSimilarity,
  type ComparableItem,
} from "./similarity";

/**
 * التحقق المتقاطع: مقارنة معرفة المستندات بما قاله العميل في الاكتشاف
 * وبما تقرّر في الاجتماعات.
 *
 * ليه ده أهم جزء عمليًا: العميل بيقول في الاكتشاف حاجة، والمستند الرسمي
 * بتاع شركته بيقول حاجة تانية — والفرق ده هو اللي بيوقّع المشاريع. النظام
 * لازم يرصده قبل ما يتبني عليه PRD.
 *
 * الناتج أربع حالات:
 *  - `confirmed`      — المستند بيأكّد كلام العميل. أعلى درجة ثقة ممكنة.
 *  - `document_only`  — معلومة في المستندات مش موجودة في الـ Brain. مرشّحة للإضافة.
 *  - `brain_only`     — معلومة في الـ Brain بلا سند مستندي. مش خطأ، لكنها غير موثّقة.
 *  - `divergent`      — متقاربين بلا تطابق: مرشّح تعارض يحتاج حكم النموذج.
 *
 * الوحدة نقية بالكامل — مفيش I/O.
 */

/** جملة مستخرجة من الـ Brain مع موضعها، عشان النتيجة تفضل قابلة للتتبّع. */
export interface BrainStatement {
  sectionKey: BrainSectionKey;
  index: number;
  text: string;
}

/**
 * الحقل اللي بيحمل نص الجملة في كل قسم مصفوفة.
 * نفس مفاتيح الهوية المستخدمة في الدمج الإضافي — التطابق ده مقصود عشان
 * التحقق المتقاطع والدمج يشتغلوا على نفس تعريف "الجملة".
 */
const STATEMENT_FIELD: Partial<Record<BrainSectionKey, string>> = {
  business_goals: "statement",
  stakeholders: "name",
  business_rules: "rule",
  functional_requirements: "statement",
  constraints: "constraint",
  assumptions: "statement",
  risks: "risk",
  known_facts: "fact",
  missing_information: "info",
  user_roles: "role",
  suggested_features: "title",
  suggested_integrations: "title",
  suggested_kpis: "name",
  roadmap: "phase",
  meeting_questions: "question",
};

/** الأقسام اللي مش منطقي نقارن المستندات بيها. */
const SKIPPED_SECTIONS = new Set<BrainSectionKey>([
  // أسئلة الاجتماع القادم مش معرفة مثبتة، والمعلومات الناقصة بتعريفها
  // غير معروفة — مقارنتها بالمستندات كانت هتطلّع ضجيج مش نتائج.
  "meeting_questions",
  "missing_information",
]);

/** يفرد جمل الـ Brain في قائمة مسطّحة قابلة للمقارنة. */
export function flattenBrainStatements(content: BrainContent | null): BrainStatement[] {
  if (!content) return [];
  const out: BrainStatement[] = [];

  for (const key of BRAIN_SECTIONS) {
    if (SKIPPED_SECTIONS.has(key)) continue;
    const field = STATEMENT_FIELD[key];
    if (!field) continue;

    const section = content[key] as { content?: unknown } | undefined;
    const items = section?.content;
    if (!Array.isArray(items)) continue;

    items.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const value = (item as Record<string, unknown>)[field];
      if (typeof value !== "string" || value.trim().length === 0) return;
      out.push({ sectionKey: key, index, text: value.trim() });
    });
  }

  return out;
}

/** مصدر خارجي بيتقارن بالمعرفة: جملة من الـ Brain أو قرار اجتماع. */
export interface ExternalStatement {
  id: string;
  text: string;
  source: "brain" | "meeting" | "discovery" | "decision";
  label: string;
}

export function brainStatementsToExternal(statements: BrainStatement[]): ExternalStatement[] {
  return statements.map((s) => ({
    id: `brain:${s.sectionKey}:${s.index}`,
    text: s.text,
    source: "brain",
    label: `Project Brain — ${s.sectionKey}`,
  }));
}

export interface CrossValidationMatch {
  itemId: string;
  externalId: string;
  externalSource: ExternalStatement["source"];
  externalLabel: string;
  externalText: string;
  score: number;
}

export interface CrossValidationResult {
  /** المستند يؤكّد المصدر الخارجي — تطابق عالي. */
  confirmed: CrossValidationMatch[];
  /** متقاربين بلا تطابق — مرشّحون لحكم النموذج: تأكيد أم تعارض؟ */
  divergent: CrossValidationMatch[];
  /** عناصر معرفة بلا أي مقابل خارجي — مرشّحة للإضافة للـ Brain. */
  documentOnlyItemIds: string[];
  /** جمل خارجية بلا سند مستندي. */
  unbackedExternalIds: string[];
  /** عدد المرشّحين اللي اتشالوا بسبب السقف — بيتسجّل عشان الاقتطاع ما يبقاش صامتًا. */
  truncatedDivergent: number;
}

/** يحوّل جملة خارجية لشكل قابل للمقارنة بنفس دالة التشابه. */
function externalToComparable(statement: ExternalStatement): ComparableItem {
  return {
    id: statement.id,
    // تصنيف موحّد: المقارنة هنا عبر المصادر، فالتصنيف مالوش دور.
    category: "cross",
    title: statement.text,
    content: statement.text,
    confidence: 100,
    created_at: "",
  };
}

function itemToComparable(item: {
  id: string;
  title: string;
  content: string;
}): ComparableItem {
  return {
    id: item.id,
    category: "cross",
    title: item.title,
    content: item.content,
    confidence: 100,
    created_at: "",
  };
}

/**
 * يقارن عناصر المعرفة بالمصادر الخارجية.
 *
 * لكل عنصر بناخد **أعلى تطابق واحد** بس، مش كل المطابقات: العنصر الواحد
 * ممكن يتقارب مع خمس جمل في الـ Brain، وتسجيلهم كلهم كان هيغرق الـ PM
 * في تكرار بلا معنى.
 */
export function crossValidate(
  items: { id: string; title: string; content: string }[],
  externals: ExternalStatement[],
  options: { maxDivergent?: number } = {}
): CrossValidationResult {
  const maxDivergent = options.maxDivergent ?? 40;

  const confirmed: CrossValidationMatch[] = [];
  const divergentAll: CrossValidationMatch[] = [];
  const documentOnlyItemIds: string[] = [];
  const matchedExternalIds = new Set<string>();

  const externalComparables = externals.map(externalToComparable);

  for (const item of items) {
    const itemComparable = itemToComparable(item);

    let best: { external: ExternalStatement; score: number } | null = null;
    for (let i = 0; i < externals.length; i += 1) {
      const score = itemSimilarity(itemComparable, externalComparables[i]);
      if (!best || score > best.score) best = { external: externals[i], score };
    }

    if (!best || best.score < CANDIDATE_THRESHOLD) {
      documentOnlyItemIds.push(item.id);
      continue;
    }

    const match: CrossValidationMatch = {
      itemId: item.id,
      externalId: best.external.id,
      externalSource: best.external.source,
      externalLabel: best.external.label,
      externalText: best.external.text,
      score: best.score,
    };

    matchedExternalIds.add(best.external.id);
    if (best.score >= DUPLICATE_THRESHOLD) confirmed.push(match);
    else divergentAll.push(match);
  }

  divergentAll.sort((a, b) => b.score - a.score);
  const divergent = divergentAll.slice(0, maxDivergent);

  return {
    confirmed,
    divergent,
    documentOnlyItemIds,
    unbackedExternalIds: externals
      .filter((e) => !matchedExternalIds.has(e.id))
      .map((e) => e.id),
    truncatedDivergent: Math.max(0, divergentAll.length - divergent.length),
  };
}

/**
 * درجة تغطية المعرفة: نسبة جمل الـ Brain اللي عندها سند مستندي.
 *
 * بترجّع `null` لما مفيش جمل أصلًا — الصفر هنا كان هيبان كأنه تقييم سيء
 * لمشروع لسه ما بدأش، وده تضليل.
 */
export function coverageScore(result: CrossValidationResult, externalCount: number): number | null {
  if (externalCount === 0) return null;
  const backed = externalCount - result.unbackedExternalIds.length;
  return Math.round((backed / externalCount) * 100);
}
