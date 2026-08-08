/**
 * NEXVORA Stage Assignments — Scenario Tests (0107)
 *   5) تعيين مسؤول + مراجع للمرحلة
 *   6) كشف مرحلة متأخّرة (isStageOverdue من derive)
 */
import { describe, it, expect } from "vitest";
import type { StageAssignmentRow, StageKey } from "./types";
import { isStageOverdue, summarizeAssignments } from "./derive";

const NOW = "2026-08-08T10:00:00.000Z";

function fakeUpsert(
  projectId: string, stageKey: StageKey, patch: Partial<StageAssignmentRow>,
): StageAssignmentRow {
  return {
    projectId, stageKey,
    ownerId: patch.ownerId ?? null,
    reviewerId: patch.reviewerId ?? null,
    dueDate: patch.dueDate ?? null,
    status: patch.status ?? "not_started",
    notes: patch.notes ?? "",
    createdAt: NOW, updatedAt: NOW,
  };
}

describe("Scenario 5: تعيين مسؤول + مراجع للمرحلة", () => {
  it("يُنشئ صفًا واحدًا فيه ownerId + reviewerId + dueDate", () => {
    const row = fakeUpsert("p1", "product_definition", {
      ownerId: "u-owner", reviewerId: "u-reviewer",
      dueDate: "2026-08-20", status: "in_progress",
    });
    expect(row.ownerId).toBe("u-owner");
    expect(row.reviewerId).toBe("u-reviewer");
    expect(row.dueDate).toBe("2026-08-20");
    const s = summarizeAssignments([row], NOW);
    expect(s.assigned).toBe(1);
    expect(s.withReviewer).toBe(1);
  });
});

describe("Scenario 6: كشف مرحلة متأخّرة", () => {
  it("dueDate ماضي مع مرحلة غير مكتملة = overdue", () => {
    expect(isStageOverdue({ dueDate: "2026-07-01", status: "in_progress" }, NOW)).toBe(true);
    expect(isStageOverdue({ dueDate: "2026-07-01", status: "completed" }, NOW)).toBe(false);
  });
});
