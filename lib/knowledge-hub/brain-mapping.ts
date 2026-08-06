import type { BrainContent, BrainSectionKey, PriorityLevel } from "@/lib/brain-v2/types";
import type { EvidenceRef } from "@/lib/discovery-analysis/types";

/**
 * تحويل مقترح التوليف لعنصر بشكل قسم الـ Brain الصحيح.
 *
 * لكل قسم شكل مختلف: قاعدة العمل عندها `rule` و`rationale`، والخطر عنده
 * `risk` و`cause` و`likelihood` و`impact`، والدور عنده `responsibilities`
 * كمصفوفة. المقترح بييجي بشكل موحّد (عنوان + تفصيل)، فالمحوّل ده هو
 * الترجمة بينهم.
 *
 * الوحدة نقية بالكامل — دي أهم نقطة في السلسلة كلها، لأن الناتج بيدخل
 * الـ Brain فعليًا، فلازم يكون مختبَرًا بالكامل من غير قاعدة بيانات.
 */

export interface KnowledgeProposal {
  /** معرّف عنصر المعرفة اللي المقترح متخزّن فيه. */
  id: string;
  section: BrainSectionKey;
  title: string;
  detail: string;
  confidence: number;
  priority: PriorityLevel;
  /** اقتباسات المصدر: النص الحرفي وموضعه. */
  evidence: { quote: string; locator: string }[];
  /** اسم المستند المصدر — بيظهر في تسمية الدليل. */
  sourceTitle: string;
}

/**
 * الأقسام اللي المحوّل بيعرف يبني لها عنصرًا.
 * أي قسم بره القائمة دي بيترفض صراحةً بدل ما ننتج عنصرًا بشكل غلط
 * يكسر الـ Brain بصمت.
 */
export const MAPPABLE_SECTIONS: BrainSectionKey[] = [
  "business_goals",
  "stakeholders",
  "business_rules",
  "functional_requirements",
  "constraints",
  "assumptions",
  "risks",
  "known_facts",
  "user_roles",
  "suggested_features",
  "suggested_integrations",
  "suggested_kpis",
];

export function isMappableSection(section: string): section is BrainSectionKey {
  return (MAPPABLE_SECTIONS as string[]).includes(section);
}

/**
 * يبني مراجع الدليل من اقتباسات المستند.
 *
 * `question_id` بيحمل معرّف عنصر المعرفة عشان أي بند في الـ Brain يفضل
 * قابل للرجوع لمصدره المستندي — نفس مبدأ الأدلة في التوصيات المعتمدة.
 */
export function proposalEvidence(proposal: KnowledgeProposal): EvidenceRef[] {
  if (proposal.evidence.length === 0) {
    // مقترح بلا اقتباس محفوظ لسه له سند: عنصر المعرفة نفسه ومستنده.
    // الدليل الفاضي كان هيمنع اعتماد الـ Brain عند بوابة الأدلة.
    return [
      {
        question_id: `knowledge:${proposal.id}`,
        question_label: `مستند — ${proposal.sourceTitle}`,
        quote: proposal.title,
      },
    ];
  }
  return proposal.evidence.slice(0, 3).map((e) => ({
    question_id: `knowledge:${proposal.id}`,
    question_label: `مستند — ${proposal.sourceTitle}${e.locator ? ` (${e.locator})` : ""}`,
    quote: e.quote,
  }));
}

/** يستنتج نوع القيد من نصّه — الافتراضي `other` بدل تخمين متحيّز. */
export function inferConstraintType(
  text: string
): "legal" | "technical" | "budget" | "timeline" | "other" {
  const t = text.toLowerCase();
  if (/قانون|تشريع|لائحة|امتثال|رخصة|ضريب|legal|complian|regulat/.test(t)) return "legal";
  if (/ميزانية|تكلفة|مالي|budget|cost/.test(t)) return "budget";
  if (/موعد|مدة|جدول زمني|تاريخ|deadline|timeline/.test(t)) return "timeline";
  if (/تقني|نظام|خادم|قاعدة بيانات|تكامل|api|technical|server|database/.test(t))
    return "technical";
  return "other";
}

/** يقسّم التفصيل لمسؤوليات — سطر أو فاصلة أو نقطة تعداد. */
export function splitResponsibilities(detail: string): string[] {
  return detail
    .split(/[\n•؛;]|(?<=\S)\s-\s(?=\S)/)
    .map((s) => s.trim().replace(/^[-–—*]\s*/, ""))
    .filter((s) => s.length > 1)
    .slice(0, 8);
}

/**
 * يحوّل المقترح لعنصر جاهز للإدراج في قسمه.
 * بيرجّع `null` للقسم غير المدعوم.
 */
export function proposalToBrainItem(proposal: KnowledgeProposal): unknown | null {
  if (!isMappableSection(proposal.section)) return null;

  const evidence = proposalEvidence(proposal);
  const title = proposal.title.trim();
  const detail = proposal.detail.trim();

  switch (proposal.section) {
    case "business_goals":
      return { statement: title, priority: proposal.priority, evidence };

    case "stakeholders":
      // العنوان اسم الجهة والتفصيل دورها — لو التفصيل فاضي بنقول ده
      // صراحةً بدل ما نسيب حقل إجباري فاضي في الـ Brain.
      return {
        name: title,
        role: detail || "الدور غير محدّد في المستند",
        influence: proposal.priority,
        evidence,
      };

    case "business_rules":
      return { rule: title, rationale: detail, evidence };

    case "functional_requirements":
      return { statement: detail ? `${title} — ${detail}` : title, evidence };

    case "constraints":
      return {
        constraint: detail ? `${title} — ${detail}` : title,
        type: inferConstraintType(`${title} ${detail}`),
        evidence,
      };

    case "assumptions":
      return { statement: title, reason: detail || "مستنتج من المستندات.", evidence };

    case "risks":
      return {
        risk: title,
        cause: detail || "السبب غير موضّح في المستند.",
        likelihood: proposal.priority,
        impact: proposal.priority,
        evidence,
      };

    case "known_facts":
      return { fact: detail ? `${title} — ${detail}` : title, category: "documents", evidence };

    case "user_roles": {
      const responsibilities = splitResponsibilities(detail);
      return {
        role: title,
        responsibilities:
          responsibilities.length > 0 ? responsibilities : ["المسؤوليات غير محدّدة في المستند"],
        evidence,
      };
    }

    case "suggested_features":
    case "suggested_integrations":
      return { title, rationale: detail, priority: proposal.priority, evidence };

    case "suggested_kpis":
      return {
        name: title,
        target_or_direction: detail || "الاتجاه غير محدّد في المستند",
        goal_link: "",
        evidence,
      };

    default:
      return null;
  }
}

export interface BuildResult {
  /** محتوى وارد بشكل الـ Brain، جاهز للدمج الإضافي. */
  incoming: Partial<Record<BrainSectionKey, unknown[]>>;
  /** المقترحات اللي اتحوّلت فعليًا. */
  mappedIds: string[];
  /** اللي اترفضوا لأن قسمهم غير مدعوم. */
  skippedIds: string[];
}

/**
 * يبني خريطة الأقسام من مجموعة مقترحات.
 *
 * الناتج جزئي عن قصد: بيحمل الأقسام اللي فيها إضافات بس. الدمج الإضافي
 * بيتعامل مع الغائب كـ"لا جديد"، فبناء الـ 19 قسم كاملة كان هيبقى ضجيجًا.
 */
export function buildIncomingSections(proposals: KnowledgeProposal[]): BuildResult {
  const incoming: Partial<Record<BrainSectionKey, unknown[]>> = {};
  const mappedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const proposal of proposals) {
    const item = proposalToBrainItem(proposal);
    if (item === null) {
      skippedIds.push(proposal.id);
      continue;
    }
    const list = incoming[proposal.section] ?? [];
    list.push(item);
    incoming[proposal.section] = list;
    mappedIds.push(proposal.id);
  }

  return { incoming, mappedIds, skippedIds };
}

/**
 * يدمج الأقسام الواردة في نسخة من محتوى الـ Brain القائم.
 *
 * بيرجّع محتوى كامل الشكل عشان `mergeBrainContentAdditive` تقدر تشتغل
 * عليه — بننسخ القائم ونستبدل محتوى الأقسام المتأثرة بس بالعناصر
 * الجديدة، والدمج الإضافي هو اللي بيتولّى إزالة التكرار والحفاظ على القديم.
 */
export function applyIncomingToContent(
  existing: BrainContent,
  incoming: Partial<Record<BrainSectionKey, unknown[]>>
): BrainContent {
  const next = { ...existing } as unknown as Record<string, unknown>;

  for (const [key, items] of Object.entries(incoming)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    const section = (existing as unknown as Record<string, unknown>)[key] as
      | { meta: unknown }
      | undefined;
    if (!section) continue;
    next[key] = { meta: section.meta, content: items };
  }

  return next as unknown as BrainContent;
}
