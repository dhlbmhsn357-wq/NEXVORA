/**
 * NEXVORA Product Decisions Register — Types (0107)
 * =================================================
 * سجل موحّد يجمع 4 أنواع من العناصر التشغيلية:
 *   assumption · risk · open_question · decision
 * كل نوع بيستخدم مجموعة أعمدة مختلفة (mitigation للـ risk، resolution
 * للـ question/decision، decision_date للـ decision) — كلها متعايشة في
 * جدول واحد لتبسيط الاستعلامات والمشاهدات المشتركة.
 */

export type ItemType = "assumption" | "risk" | "open_question" | "decision";
export const ITEM_TYPES: readonly ItemType[] = ["assumption", "risk", "open_question", "decision"] as const;
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  assumption: "افتراض",
  risk: "مخاطرة",
  open_question: "سؤال مفتوح",
  decision: "قرار",
};

export type ItemStatus =
  | "open" | "in_review" | "confirmed" | "resolved" | "rejected" | "deferred";
export const ITEM_STATUSES: readonly ItemStatus[] = [
  "open", "in_review", "confirmed", "resolved", "rejected", "deferred",
] as const;
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  open: "مفتوح",
  in_review: "قيد المراجعة",
  confirmed: "مؤكّد",
  resolved: "محلول",
  rejected: "مرفوض",
  deferred: "مؤجّل",
};

export type ItemPriority = "low" | "medium" | "high" | "critical";
export const ITEM_PRIORITIES: readonly ItemPriority[] = ["low", "medium", "high", "critical"] as const;
export const ITEM_PRIORITY_LABELS: Record<ItemPriority, string> = {
  low: "منخفض", medium: "متوسّط", high: "عالٍ", critical: "حرج",
};

export interface ProductDecisionItemRow {
  id: string;
  projectId: string;
  itemType: ItemType;
  title: string;
  description: string;
  status: ItemStatus;
  priority: ItemPriority;
  ownerId: string | null;
  dueDate: string | null;
  impact: string;
  mitigation: string;
  resolution: string;
  decisionDate: string | null;
  linkedRequirementId: string | null;
  linkedStoryId: string | null;
  linkedScopeItemId: string | null;
  stageKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
