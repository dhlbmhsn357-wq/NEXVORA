import { describe, it, expect } from "vitest";
import { isStageOverdue, summarizeAssignments, getStageProgress } from "./derive";
import type { StageAssignmentRow, StageKey, StageAssignmentStatus } from "./types";
import { STAGE_KEYS } from "./types";

const NOW = "2026-08-08T10:00:00.000Z";

function make(
  stageKey: StageKey, over: Partial<StageAssignmentRow> = {},
): StageAssignmentRow {
  return {
    projectId: "p1", stageKey,
    ownerId: null, reviewerId: null, dueDate: null,
    status: "not_started" as StageAssignmentStatus, notes: "",
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}

describe("stage-assignments/derive", () => {
  it("isStageOverdue — dueDate الماضي مع مرحلة غير مكتملة = overdue", () => {
    expect(isStageOverdue({ dueDate: "2026-08-01", status: "in_progress" }, NOW)).toBe(true);
    expect(isStageOverdue({ dueDate: "2026-08-01", status: "completed" }, NOW)).toBe(false);
    expect(isStageOverdue({ dueDate: "2026-08-08", status: "in_progress" }, NOW)).toBe(false);
    expect(isStageOverdue({ dueDate: null, status: "in_progress" }, NOW)).toBe(false);
  });

  it("summarizeAssignments — يعد المسندة والمتأخرة ويحصر المفقود", () => {
    const rows = [
      make("client_and_project", { ownerId: "u1", reviewerId: "u2", status: "in_progress", dueDate: "2026-08-01" }),
      make("product_definition", { ownerId: "u1", status: "completed" }),
    ];
    const s = summarizeAssignments(rows, NOW);
    expect(s.total).toBe(2);
    expect(s.assigned).toBe(2);
    expect(s.withReviewer).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.byStatus.completed).toBe(1);
    expect(s.byStatus.in_progress).toBe(1);
    expect(s.missingStages.length).toBe(STAGE_KEYS.length - 2);
  });

  it("getStageProgress — النسبة على 7 مراحل", () => {
    const rows = [
      make("client_and_project", { status: "completed" }),
      make("discovery_and_research", { status: "completed" }),
      make("analysis_and_validation", { status: "in_progress" }),
    ];
    // 2/7 ≈ 29
    expect(getStageProgress(rows)).toBe(Math.round((2 / 7) * 100));
  });
});
