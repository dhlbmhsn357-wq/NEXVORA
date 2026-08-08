/**
 * Prototype Studio — Security Filter
 * ==================================
 * قواعد استبعاد للحقول الحسّاسة قبل تجميع Context Pack.
 *
 * القاعدة الذهبية: أي بناء Context Pack يمر عبر service functions
 * الموجودة (product-definition, prd, brain-v2 downstream, user-stories,
 * product-decisions, market-research). لا تستخدم `select *` مباشرة.
 *
 * الحقول الممنوعة (deny-list) تُذكر هنا كمرجع نصّي للمراجع البشرية:
 *   • ai_task_model_config (كل الجدول)
 *   • commercial / commercial_full / handoff_partners (تسعير/هوامش)
 *   • market_research: أي عنصر confidentiality != 'public'
 *   • raw_prompt / sync_status / last_error / private_notes
 *   • information_classification_marks — تُستخدم كـ deny-list إضافية
 */

import type { MarketResearchItem } from "@/lib/market-research/types";

export const SENSITIVE_FIELD_DENY_LIST: readonly string[] = [
  "ai_task_model_config",
  "commercial",
  "commercial_full",
  "handoff_partners",
  "raw_prompt",
  "sync_status",
  "last_error",
  "private_notes",
  "information_classification_marks",
] as const;

/** يستبعد أي عنصر بحث سوق مصنّف داخلي أو سرّي؛ يُبقي 'public' فقط. */
export function filterConfidentialResearch(
  items: readonly MarketResearchItem[],
): MarketResearchItem[] {
  return items.filter((it) => it.confidentiality === "public");
}
