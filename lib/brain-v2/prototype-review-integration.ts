import type { GapReport } from "@/lib/types/database";
import { proposeChanges, type KnowledgeCandidate } from "./knowledge-aggregation";

/**
 * فجوات Prototype Review (مزايا ناقصة/مخاطر لم تُحل/توسّع نطاق) —
 * إشارات حقيقية إن الكود الفعلي بيكشف حاجة كانت غايبة عن PRD/Brain.
 * بتتحوّل لمرشحي معرفة بدل ما تفضل حبيسة تقرير المراجعة بس.
 */
function buildCandidates(gapReport: GapReport): KnowledgeCandidate[] {
  const candidates: KnowledgeCandidate[] = [];
  const rationale = "اكتُشف أثناء مراجعة Prototype مقابل الكود الفعلي";

  for (const feature of gapReport.missing_features) {
    candidates.push({ sectionKey: "functional_requirements", newValue: { statement: feature, evidence: [] }, rationale });
  }
  for (const risk of gapReport.unresolved_risks) {
    candidates.push({
      sectionKey: "risks",
      newValue: { risk, cause: "اكتُشف من Prototype Review", likelihood: "medium", impact: "medium", evidence: [] },
      rationale,
    });
  }
  for (const scope of gapReport.scope_creep) {
    candidates.push({ sectionKey: "known_facts", newValue: { fact: scope, category: "توسّع نطاق من Prototype Review", evidence: [] }, rationale });
  }

  return candidates;
}

export async function proposePrototypeReviewChanges(
  projectId: string,
  reviewId: string,
  gapReport: GapReport
): Promise<{ proposedCount: number }> {
  const candidates = buildCandidates(gapReport);
  if (candidates.length === 0) return { proposedCount: 0 };

  const result = await proposeChanges(
    projectId,
    "prototype_review",
    reviewId,
    `فجوات مكتشفة من مراجعة Prototype (${candidates.length} عنصر)`,
    candidates
  );
  return { proposedCount: result.proposedCount };
}
