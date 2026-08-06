import { makeState } from "./helpers";
import type { StageState } from "../types";

/**
 * حالة مرحلة مركز المعرفة في مسار العمل.
 *
 * "مكتملة" هنا معناها: كل مصدر مرفوع اتحلّل (أو اتحفظ كمرجع بوضوح)،
 * **و** كل فجوة معرفية اتاخد فيها قرار. الفجوة المفتوحة سؤال حقيقي
 * لسه بلا إجابة، فاعتبار المرحلة مكتملة وهي موجودة كان هيخفي شغلًا ناقصًا.
 */
export interface KnowledgeHubSummary {
  totalSources: number;
  settledSources: number;
  failedSources: number;
  openGaps: number;
  latestUpdatedAt: string | null;
}

export function adaptKnowledgeHubStage(summary: KnowledgeHubSummary | null): StageState {
  if (!summary || summary.totalSources === 0) {
    return makeState("knowledgeHub", "not_started", 0);
  }

  const opts = { updatedAt: summary.latestUpdatedAt ?? undefined };
  const processingPct = Math.round((summary.settledSources / summary.totalSources) * 100);

  if (summary.settledSources < summary.totalSources) {
    return makeState("knowledgeHub", "in_progress", processingPct, opts);
  }

  if (summary.failedSources > 0) {
    return makeState("knowledgeHub", "needs_regeneration", processingPct, {
      ...opts,
      lastError: `${summary.failedSources} مصدر فشل تحليله.`,
    });
  }

  if (summary.openGaps > 0) {
    // كل المصادر اتحلّلت لكن فيه أسئلة مفتوحة — تقدّم شبه كامل مش كامل.
    return makeState("knowledgeHub", "in_progress", 90, opts);
  }

  return makeState("knowledgeHub", "completed", 100, opts);
}
