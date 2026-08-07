/**
 * NEXVORA Change Impact — Pure Derivations (P13)
 * ==============================================
 * لما نغيّر متطلب أو قصة أو AC، أي عناصر بتنكسر أو تحتاج مراجعة؟
 *
 * الخريطة (اتجاه واحد):
 *   Requirement → Story (linked_requirement_id)
 *   Story → AC (user_story_id)
 *   Story → EvaluationScenario (linked_story_id)
 *   Requirement → EvidenceLink (source_type = 'requirement')
 *   Story → EvidenceLink (source_type = 'user_story')
 *   AC → EvidenceLink (source_type = 'acceptance_criterion')
 *
 * الدالة النقيّة `computeImpact` بتاخد identifier + type وتعيد كل العناصر
 * المرتبطة بشكل مباشر أو غير مباشر (transitive) في level واحد فوق.
 */
import type { RequirementRow } from "@/lib/product-definition/types";
import type { UserStoryRow, AcceptanceCriterionRow } from "@/lib/user-stories/types";
import type { EvaluationScenarioRow } from "@/lib/evaluation/types";
import type { EvidenceLinkRow, EvidenceSourceType } from "@/lib/evidence/types";

export type ImpactSourceType = "requirement" | "user_story" | "acceptance_criterion";

export interface ImpactedItem {
  type: "story" | "acceptance_criterion" | "evaluation_scenario" | "evidence_link";
  id: string;
  title: string;
  detail: string;
}

export interface ImpactReport {
  sourceType: ImpactSourceType;
  sourceId: string;
  directStories: ImpactedItem[];
  directAcs: ImpactedItem[];
  directEvaluations: ImpactedItem[];
  directEvidence: ImpactedItem[];
  /** total count across all impacts (سهل عرضه) */
  totalImpacts: number;
}

export interface ImpactInput {
  requirements: readonly RequirementRow[];
  stories: readonly UserStoryRow[];
  acs: readonly AcceptanceCriterionRow[];
  scenarios: readonly EvaluationScenarioRow[];
  evidence: readonly EvidenceLinkRow[];
}

/**
 * حسبة impact لعنصر واحد.
 * ملاحظات:
 * - `requirement` → نبحث كل قصص مربوطة بـ linked_requirement_id
 *   ثم لكل قصة نجيب الـ AC + Evaluation Scenarios + Evidence
 *   لكن نرجّعهم كـ "direct" مرة واحدة (بدون duplication).
 * - `user_story` → AC + Evaluation Scenarios + Evidence مباشرة
 * - `acceptance_criterion` → Evidence + Evaluation Scenarios (لو مرتبطة بـ story)
 */
export function computeImpact(
  sourceType: ImpactSourceType,
  sourceId: string,
  input: ImpactInput,
): ImpactReport {
  const empty: ImpactReport = {
    sourceType, sourceId,
    directStories: [], directAcs: [], directEvaluations: [], directEvidence: [],
    totalImpacts: 0,
  };

  const evByType = (t: EvidenceSourceType, id: string): ImpactedItem[] =>
    input.evidence
      .filter((e) => e.sourceType === t && e.sourceId === id)
      .map((e) => ({
        type: "evidence_link",
        id: e.id,
        title: `${e.evidenceType === "market_research" ? "بحث سوقي" : "تحقق مشكلة"} — دليل مرتبط`,
        detail: e.note || "بدون تعليق",
      }));

  const storyImpacts = (storyId: string): { acs: ImpactedItem[]; scen: ImpactedItem[]; ev: ImpactedItem[] } => {
    const acs: ImpactedItem[] = input.acs
      .filter((a) => a.userStoryId === storyId)
      .map((a) => ({
        type: "acceptance_criterion", id: a.id,
        title: a.title || `AC #${a.orderIndex}`,
        detail: `Given ${a.givenClause.slice(0, 40)}…`,
      }));
    const scen: ImpactedItem[] = input.scenarios
      .filter((s) => s.linkedStoryId === storyId)
      .map((s) => ({
        type: "evaluation_scenario", id: s.id,
        title: s.title, detail: `فئة ${s.category} · خطورة ${s.severity}`,
      }));
    const ev = evByType("user_story", storyId);
    return { acs, scen, ev };
  };

  if (sourceType === "requirement") {
    const stories = input.stories.filter((s) => s.linkedRequirementId === sourceId);
    const directStories: ImpactedItem[] = stories.map((s) => ({
      type: "story", id: s.id, title: s.title, detail: s.status,
    }));
    const acs: ImpactedItem[] = [];
    const scen: ImpactedItem[] = [];
    const ev: ImpactedItem[] = [...evByType("requirement", sourceId)];
    for (const st of stories) {
      const impacts = storyImpacts(st.id);
      acs.push(...impacts.acs);
      scen.push(...impacts.scen);
      ev.push(...impacts.ev);
    }
    // Also AC evidence (transitively)
    for (const a of acs) {
      ev.push(...evByType("acceptance_criterion", a.id));
    }
    const total = directStories.length + acs.length + scen.length + ev.length;
    return { ...empty, directStories, directAcs: acs, directEvaluations: scen, directEvidence: ev, totalImpacts: total };
  }

  if (sourceType === "user_story") {
    const impacts = storyImpacts(sourceId);
    const total = impacts.acs.length + impacts.scen.length + impacts.ev.length;
    return { ...empty, directAcs: impacts.acs, directEvaluations: impacts.scen, directEvidence: impacts.ev, totalImpacts: total };
  }

  if (sourceType === "acceptance_criterion") {
    const ev = evByType("acceptance_criterion", sourceId);
    // AC don't directly link to scenarios; but if scenarios link the AC's story, count them here for context.
    const ac = input.acs.find((a) => a.id === sourceId);
    const scen: ImpactedItem[] = ac
      ? input.scenarios
          .filter((s) => s.linkedStoryId === ac.userStoryId)
          .map((s) => ({ type: "evaluation_scenario", id: s.id, title: s.title, detail: `فئة ${s.category}` }))
      : [];
    const total = ev.length + scen.length;
    return { ...empty, directEvaluations: scen, directEvidence: ev, totalImpacts: total };
  }

  return empty;
}
