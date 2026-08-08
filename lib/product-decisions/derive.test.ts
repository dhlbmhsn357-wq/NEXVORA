import { describe, it, expect } from "vitest";
import {
  filterByType, isOverdue, summarizeByStatus, countOpen, countCriticalOpenRisks,
} from "./derive";
import type { ProductDecisionItemRow, ItemType, ItemStatus, ItemPriority } from "./types";

const NOW = "2026-08-08T10:00:00.000Z";

function row(
  over: Partial<ProductDecisionItemRow> & { itemType: ItemType; status?: ItemStatus; priority?: ItemPriority },
): ProductDecisionItemRow {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: "p1",
    title: "t",
    description: "",
    ownerId: null,
    dueDate: null,
    impact: "",
    mitigation: "",
    resolution: "",
    decisionDate: null,
    linkedRequirementId: null,
    linkedStoryId: null,
    linkedScopeItemId: null,
    stageKey: null,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    status: "open",
    priority: "medium",
    ...over,
  };
}

describe("product-decisions/derive", () => {
  it("filterByType — يفصل حسب النوع", () => {
    const rows = [row({ itemType: "risk" }), row({ itemType: "assumption" }), row({ itemType: "risk" })];
    expect(filterByType(rows, "risk").length).toBe(2);
    expect(filterByType(rows, "assumption").length).toBe(1);
    expect(filterByType(rows, "decision").length).toBe(0);
  });

  it("isOverdue — مفتوح بعد dueDate = overdue", () => {
    expect(isOverdue({ dueDate: "2026-08-07", status: "open" }, NOW)).toBe(true);
    expect(isOverdue({ dueDate: "2026-08-08", status: "open" }, NOW)).toBe(false);
    expect(isOverdue({ dueDate: null, status: "open" }, NOW)).toBe(false);
    expect(isOverdue({ dueDate: "2020-01-01", status: "resolved" }, NOW)).toBe(false);
    expect(isOverdue({ dueDate: "2020-01-01", status: "rejected" }, NOW)).toBe(false);
    expect(isOverdue({ dueDate: "2020-01-01", status: "deferred" }, NOW)).toBe(false);
  });

  it("summarizeByStatus — يعد كل حالة", () => {
    const rows = [
      row({ itemType: "risk", status: "open" }),
      row({ itemType: "risk", status: "open" }),
      row({ itemType: "assumption", status: "resolved" }),
      row({ itemType: "open_question", status: "in_review" }),
    ];
    const s = summarizeByStatus(rows);
    expect(s.open).toBe(2);
    expect(s.resolved).toBe(1);
    expect(s.in_review).toBe(1);
    expect(s.confirmed).toBe(0);
  });

  it("countOpen — يستثني resolved/rejected/deferred", () => {
    const rows = [
      row({ itemType: "risk", status: "open" }),
      row({ itemType: "risk", status: "in_review" }),
      row({ itemType: "risk", status: "resolved" }),
      row({ itemType: "risk", status: "rejected" }),
      row({ itemType: "risk", status: "deferred" }),
    ];
    expect(countOpen(rows)).toBe(2);
  });

  it("countCriticalOpenRisks — critical + risk + مفتوح", () => {
    const rows = [
      row({ itemType: "risk", priority: "critical", status: "open" }),
      row({ itemType: "risk", priority: "critical", status: "resolved" }),
      row({ itemType: "risk", priority: "high", status: "open" }),
      row({ itemType: "assumption", priority: "critical", status: "open" }),
    ];
    expect(countCriticalOpenRisks(rows)).toBe(1);
  });
});
