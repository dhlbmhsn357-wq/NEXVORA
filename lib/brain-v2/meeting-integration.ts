import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingExtraction } from "@/lib/types/database";
import { proposeChanges, type KnowledgeCandidate } from "./knowledge-aggregation";
import type { BrainSectionKey } from "./types";

/**
 * يحوّل نتائج استخراج الاجتماع (قرارات/مخاطر/طلبات/أسئلة/مواعيد نهائية)
 * لمرشحي معرفة — القرارات والطلبات "حقائق معروفة"، المخاطر لقسم
 * المخاطر، الأسئلة لقسم "أسئلة الاجتماع"، والمواعيد النهائية قيد زمني.
 */
function buildCandidates(extraction: MeetingExtraction): KnowledgeCandidate[] {
  const candidates: KnowledgeCandidate[] = [];
  const rationale = "مُستخرج تلقائيًا من تحليل AI لمحضر اجتماع";

  for (const d of extraction.decisions) {
    candidates.push({ sectionKey: "known_facts", newValue: { fact: d, category: "قرار من اجتماع", evidence: [] }, rationale });
  }
  for (const r of extraction.requests) {
    candidates.push({ sectionKey: "known_facts", newValue: { fact: r, category: "طلب من اجتماع", evidence: [] }, rationale });
  }
  for (const r of extraction.risks) {
    candidates.push({
      sectionKey: "risks",
      newValue: { risk: r, cause: "مذكور في اجتماع", likelihood: "medium", impact: "medium", evidence: [] },
      rationale,
    });
  }
  for (const q of extraction.questions) {
    candidates.push({ sectionKey: "meeting_questions", newValue: { question: q, reason: "من محضر الاجتماع", priority: "medium" }, rationale });
  }
  for (const dl of extraction.deadlines) {
    candidates.push({ sectionKey: "constraints", newValue: { constraint: dl, type: "timeline", evidence: [] }, rationale });
  }

  return candidates;
}

/**
 * يقترح تغييرات على Project Brain من نتائج استخراج اجتماع — Pending
 * Changes بانتظار اعتماد PM، مش كتابة مباشرة صامتة (كان كده قبل كده،
 * راجع Phase 3 Enhancement — القاعدة الجديدة المؤكّدة بتنطبق على كل
 * المصادر بما فيها الاجتماعات). لو المشروع لسه معندوش Brain معتمد
 * أصلًا (لسه في مرحلة Discovery)، بيتجاهل بهدوء — نفس السلوك القديم.
 */
export async function mergeMeetingIntoBrain(
  supabase: SupabaseClient,
  projectId: string,
  meetingId: string,
  extraction: MeetingExtraction,
  actorId: string | null
): Promise<{ ok: true; skipped?: true; proposedCount?: number; batchId?: string } | { ok: false; message: string }> {
  void supabase;
  void actorId;

  const candidates = buildCandidates(extraction);
  if (candidates.length === 0) return { ok: true, skipped: true };

  const result = await proposeChanges(
    projectId,
    "meeting_ai_analysis",
    meetingId,
    `تحديثات مقترحة من اجتماع (${candidates.length} عنصر مستخرج)`,
    candidates
  );

  if (result.skippedNoBrain) return { ok: true, skipped: true };
  if (result.proposedCount === 0) return { ok: true, skipped: true };

  return { ok: true, proposedCount: result.proposedCount, batchId: result.batchId ?? undefined };
}

export type { BrainSectionKey };
