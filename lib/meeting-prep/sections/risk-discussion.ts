import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { RiskDiscussionContent, RiskDiscussionItem } from "../types";
import type { EvidenceRef } from "@/lib/discovery-analysis/types";

function isEvidenceRef(v: unknown): v is EvidenceRef {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.source) && isNonEmptyString(o.quote);
}
function isItem(v: unknown): v is RiskDiscussionItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.risk) || !isNonEmptyString(o.why_discuss_now)) return false;
  const evidence = o.evidence;
  if (evidence !== undefined && !(Array.isArray(evidence) && evidence.every(isEvidenceRef))) return false;
  return true;
}

export async function generateRiskDiscussion(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<RiskDiscussionContent>> {
  return generateSection<RiskDiscussionContent>({
    sectionKey: "risk_discussion",
    ctx,
    schemaInstructions: `اكتب "مخاطر للنقاش مع العميل" — مخاطر حقيقية مرتبطة بهذا المشروع تحديدًا (مش عامة)، تستحق تُطرح صراحة في الاجتماع، مع أي دليل من بيانات المشروع (لو موجود).

الـ Schema:
{
  "items": [
    {
      "risk": "المخاطرة",
      "why_discuss_now": "ليه لازم تتناقش في هذا الاجتماع بالذات",
      "evidence": [ { "source": "مصدر الدليل (مثلاً: إجابة الاكتشاف / تحليل AI)", "quote": "اقتباس أو إشارة قصيرة" } ]
    }
  ],
  "confidence": { "score": 0-100, "reason": نص أو null }
}
لو مفيش دليل مباشر لمخاطرة معينة، سيب "evidence" مصفوفة فاضية بدل ما تخترع دليل.`,
    validateContent: (obj) => {
      const items = obj.items;
      if (!Array.isArray(items) || items.length === 0 || !items.every(isItem)) {
        return { ok: false, reason: "items غير صالحة." };
      }
      const normalized: RiskDiscussionItem[] = items.map((i) => ({
        risk: i.risk,
        why_discuss_now: i.why_discuss_now,
        evidence: i.evidence ?? [],
      }));
      return { ok: true, data: { items: normalized } };
    },
    actorId,
  });
}
