import { BRAIN_SECTIONS, type BrainContent, type BrainSectionKey } from "./types";
import type {
  AssumptionDispositionsMap,
  MissingInfoDispositionsMap,
  SectionReviewsMap,
} from "./review-types";

/**
 * Project Readiness Score = مؤشّر جاهزية شامل يتجاوز الاكتمال.
 *
 * التركيبة (متوسط مرجّح):
 *   - 40% Completeness (نفس الحساب من completeness.ts — بنمرّرها هنا)
 *   - 25% Section Approval Ratio (كم قسم Approved من إجمالي الأقسام)
 *   - 20% Missing Info Resolution Ratio (كم item تمت معالجته)
 *   - 15% Assumptions Reviewed Ratio (لا يبقى pending)
 *
 * تصميم قابل للتوسع — أي وزن يمكن ضبطه من Settings لاحقًا.
 */

export interface ReadinessBreakdown {
  score: number;
  completeness: number;
  sectionApprovalPct: number;
  missingInfoResolvedPct: number;
  assumptionsReviewedPct: number;
}

const WEIGHTS = {
  completeness: 0.4,
  sectionApproval: 0.25,
  missingInfoResolved: 0.2,
  assumptionsReviewed: 0.15,
} as const;

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100; // لا شيء يستحق المراجعة = مكتمل جانبيًا
  return Math.round((numerator / denominator) * 100);
}

export function computeReadinessScore(input: {
  completeness: number; // نمرّرها من computeBrainCompleteness
  content: BrainContent;
  sectionReviews: SectionReviewsMap;
  missingInfoDispositions: MissingInfoDispositionsMap;
  assumptionDispositions: AssumptionDispositionsMap;
}): ReadinessBreakdown {
  const totalSections = BRAIN_SECTIONS.length;
  const approvedSections = BRAIN_SECTIONS.filter(
    (k) => input.sectionReviews[k]?.state === "approved"
  ).length;
  const sectionApprovalPct = pct(approvedSections, totalSections);

  const missingItems = input.content.missing_information.content;
  const missingResolved = missingItems.filter((_, i) => {
    const d = input.missingInfoDispositions[String(i)];
    return d && d.state !== "pending";
  }).length;
  const missingInfoResolvedPct = pct(missingResolved, missingItems.length);

  const assumptionItems = input.content.assumptions.content;
  const assumptionsReviewed = assumptionItems.filter((_, i) => {
    const d = input.assumptionDispositions[String(i)];
    return d && d.state !== "pending";
  }).length;
  const assumptionsReviewedPct = pct(assumptionsReviewed, assumptionItems.length);

  const score = Math.round(
    input.completeness * WEIGHTS.completeness +
      sectionApprovalPct * WEIGHTS.sectionApproval +
      missingInfoResolvedPct * WEIGHTS.missingInfoResolved +
      assumptionsReviewedPct * WEIGHTS.assumptionsReviewed
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    completeness: input.completeness,
    sectionApprovalPct,
    missingInfoResolvedPct,
    assumptionsReviewedPct,
  };
}

/**
 * حسّاس إضافي: هل الـ Draft جاهز للاعتماد؟ يستخدمه الـ approve action.
 * القاعدة: مفيش قسم مرفوض، ومفيش missing_info pending.
 */
export interface ApprovalGateResult {
  canApprove: boolean;
  blockers: string[];
}

export function checkApprovalGate(input: {
  content: BrainContent;
  sectionReviews: SectionReviewsMap;
  missingInfoDispositions: MissingInfoDispositionsMap;
  assumptionDispositions: AssumptionDispositionsMap;
  /** عدد التوصيات الذكية (Phase 4) لسه status='suggested' — قرار لازم يُتّخذ فيها قبل الاعتماد. اختياري عشان استدعاءات قديمة (Diff/الاختبارات) ما تتكسرش. */
  pendingRecommendationsCount?: number;
  /** Phase 5 — عدد عناصر Brain Review لسه في حالة عائقة (pending_review/needs_revision/blocked). */
  pendingReviewObjectsCount?: number;
  /** Phase 5 — عدد المشاكل الحرجة/العالية غير المحلولة في آخر تقرير تحقّق. */
  criticalValidationIssuesCount?: number;
  /** Phase 5 — عدد عناصر اتغيّر محتواها منذ آخر مراجعة (أو بتعتمد على عنصر تغيّر) ولسه محتاجة إعادة تحقّق. */
  needsRevalidationCount?: number;
}): ApprovalGateResult {
  const blockers: string[] = [];

  const rejectedSections: BrainSectionKey[] = BRAIN_SECTIONS.filter(
    (k) => input.sectionReviews[k]?.state === "rejected"
  );
  if (rejectedSections.length > 0) {
    blockers.push(`فيه ${rejectedSections.length} قسم مرفوض — لازم يتراجع/يتعدّل قبل الاعتماد.`);
  }

  const missingPending = input.content.missing_information.content.filter(
    (_, i) => !input.missingInfoDispositions[String(i)] || input.missingInfoDispositions[String(i)].state === "pending"
  ).length;
  if (missingPending > 0) {
    blockers.push(`فيه ${missingPending} عنصر Missing Info لسه بانتظار المراجعة.`);
  }

  const assumptionsPending = input.content.assumptions.content.filter(
    (_, i) => !input.assumptionDispositions[String(i)] || input.assumptionDispositions[String(i)].state === "pending"
  ).length;
  if (assumptionsPending > 0) {
    blockers.push(`فيه ${assumptionsPending} افتراض لسه بانتظار المراجعة.`);
  }

  if ((input.pendingRecommendationsCount ?? 0) > 0) {
    blockers.push(`فيه ${input.pendingRecommendationsCount} توصية ذكية لسه بانتظار قرار (قبول/رفض/تأجيل/نقاش) قبل الاعتماد.`);
  }

  if ((input.pendingReviewObjectsCount ?? 0) > 0) {
    blockers.push(`فيه ${input.pendingReviewObjectsCount} عنصر معرفة لسه بانتظار مراجعة فردية (Brain Review).`);
  }

  if ((input.criticalValidationIssuesCount ?? 0) > 0) {
    blockers.push(`فيه ${input.criticalValidationIssuesCount} مشكلة حرجة/عالية الخطورة مكتشفة في تحقّق Brain Review لازم تتحل أولًا.`);
  }

  if ((input.needsRevalidationCount ?? 0) > 0) {
    blockers.push(`فيه ${input.needsRevalidationCount} عنصر معرفة اتغيّر محتواه منذ آخر مراجعة ولسه محتاج إعادة تحقّق.`);
  }

  return { canApprove: blockers.length === 0, blockers };
}

/**
 * قبل الحفظ النهائي عند الاعتماد: يزيل الـ assumptions المرفوضة من المحتوى،
 * حتى ما تنتقلش للنسخة المعتمدة. الرفض المسجّل في الـ dispositions يبقى في التاريخ.
 */
export function pruneRejectedAssumptions(
  content: BrainContent,
  dispositions: AssumptionDispositionsMap
): BrainContent {
  const kept = content.assumptions.content.filter((_, i) => {
    const d = dispositions[String(i)];
    return !d || d.state !== "rejected";
  });
  return {
    ...content,
    assumptions: {
      ...content.assumptions,
      content: kept,
    },
  };
}
