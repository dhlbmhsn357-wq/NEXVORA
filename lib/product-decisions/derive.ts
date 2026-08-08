/**
 * NEXVORA Product Decisions Register — Pure Derivations (0107)
 */
import type { ProductDecisionItemRow, ItemType, ItemStatus } from "./types";

export function filterByType(
  rows: readonly ProductDecisionItemRow[],
  type: ItemType,
): ProductDecisionItemRow[] {
  return rows.filter((r) => r.itemType === type);
}

/** مفتوح ومتجاوز التاريخ. `resolved/rejected/deferred` ما تُعدّش overdue. */
export function isOverdue(row: Pick<ProductDecisionItemRow, "dueDate" | "status">, nowISO: string): boolean {
  if (!row.dueDate) return false;
  if (row.status === "resolved" || row.status === "rejected" || row.status === "deferred") return false;
  // نقارن يوم-بيوم — dueDate عبارة عن date (YYYY-MM-DD) وnowISO عبارة عن full ISO.
  const today = nowISO.slice(0, 10);
  return row.dueDate < today;
}

export type StatusSummary = Record<ItemStatus, number>;

const EMPTY_STATUS: () => StatusSummary = () => ({
  open: 0, in_review: 0, confirmed: 0, resolved: 0, rejected: 0, deferred: 0,
});

export function summarizeByStatus(rows: readonly ProductDecisionItemRow[]): StatusSummary {
  const s = EMPTY_STATUS();
  for (const r of rows) s[r.status]++;
  return s;
}

/** كل عنصر مش resolved/rejected/deferred بيعتبر مفتوح فعليًا. */
export function countOpen(rows: readonly ProductDecisionItemRow[]): number {
  return rows.filter(
    (r) => r.status !== "resolved" && r.status !== "rejected" && r.status !== "deferred",
  ).length;
}

/** عدد المخاطر الحرجة (priority=critical) اللي لسه مفتوحة — عرض في الجاهزية. */
export function countCriticalOpenRisks(rows: readonly ProductDecisionItemRow[]): number {
  return rows.filter(
    (r) =>
      r.itemType === "risk" &&
      r.priority === "critical" &&
      r.status !== "resolved" &&
      r.status !== "rejected" &&
      r.status !== "deferred",
  ).length;
}
