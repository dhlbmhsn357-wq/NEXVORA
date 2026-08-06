import { describe, it, expect } from "vitest";
import { canTransition, isWTaskTerminal, WTASK_KANBAN_COLUMNS } from "./statuses";
import { canChangeWTaskStatus, canCreateWTask, canApproveWTask } from "./permissions";
import { checklistProgress, computeWTaskMetrics, isWTaskOverdue, compareWTasks, type WTaskCore } from "./task-logic";

describe("workspace-tasks statuses", () => {
  it("allows the core workflow transitions", () => {
    expect(canTransition("todo", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "waiting_review")).toBe(true);
    expect(canTransition("waiting_review", "approved")).toBe(true);
    expect(canTransition("waiting_review", "in_progress")).toBe(true); // reject
    expect(canTransition("approved", "completed")).toBe(true);
    expect(canTransition("completed", "archived")).toBe(true);
  });
  it("rejects illegal transitions", () => {
    expect(canTransition("todo", "completed")).toBe(false);
    expect(canTransition("todo", "approved")).toBe(false);
    expect(canTransition("in_progress", "in_progress")).toBe(false);
  });
  it("kanban columns exclude archived/cancelled", () => {
    expect(WTASK_KANBAN_COLUMNS).not.toContain("archived");
    expect(WTASK_KANBAN_COLUMNS).not.toContain("cancelled");
  });
  it("marks terminal statuses", () => {
    expect(isWTaskTerminal("completed")).toBe(true);
    expect(isWTaskTerminal("todo")).toBe(false);
  });
});

describe("workspace-tasks permissions", () => {
  it("only owner/admin/supervisor create; member cannot", () => {
    expect(canCreateWTask("owner")).toBe(true);
    expect(canCreateWTask("admin")).toBe(true);
    expect(canCreateWTask("supervisor")).toBe(true);
    expect(canCreateWTask("member")).toBe(false);
  });
  it("approval is owner/admin only", () => {
    expect(canApproveWTask("owner")).toBe(true);
    expect(canApproveWTask("admin")).toBe(true);
    expect(canApproveWTask("supervisor")).toBe(false);
    expect(canApproveWTask("member")).toBe(false);
  });
  it("executor can request review but cannot approve/complete", () => {
    const base = { userId: "u1", creatorId: "u9", assigneeIds: ["u1"] };
    // member assigned → can move in_progress → waiting_review
    expect(canChangeWTaskStatus({ role: "member", ...base, from: "in_progress", to: "waiting_review" })).toBe(true);
    // member cannot approve
    expect(canChangeWTaskStatus({ role: "member", ...base, from: "waiting_review", to: "approved" })).toBe(false);
    // member cannot complete
    expect(canChangeWTaskStatus({ role: "member", ...base, from: "approved", to: "completed" })).toBe(false);
    // owner can approve
    expect(canChangeWTaskStatus({ role: "owner", ...base, from: "waiting_review", to: "approved" })).toBe(true);
  });
  it("non-participant member cannot change status", () => {
    expect(
      canChangeWTaskStatus({ role: "member", userId: "u2", creatorId: "u9", assigneeIds: ["u1"], from: "todo", to: "in_progress" })
    ).toBe(false);
  });
});

describe("workspace-tasks logic", () => {
  const core = (o: Partial<WTaskCore>): WTaskCore => ({
    status: "todo", priority: "medium", due_date: null, checklist: [], started_at: null, completed_at: null, created_at: "2026-01-01",
    ...o,
  });

  it("checklist progress", () => {
    expect(checklistProgress([])).toBe(0);
    expect(checklistProgress([{ id: "a", text: "x", done: true }, { id: "b", text: "y", done: false }])).toBe(50);
  });
  it("overdue detection ignores terminal", () => {
    const past = "2020-01-01";
    expect(isWTaskOverdue(core({ due_date: past }), Date.now())).toBe(true);
    expect(isWTaskOverdue(core({ due_date: past, status: "completed" }), Date.now())).toBe(false);
  });
  it("metrics compute completion + overdue", () => {
    const now = Date.now();
    const m = computeWTaskMetrics(
      [core({ status: "completed" }), core({ status: "todo", due_date: "2020-01-01" }), core({ status: "in_progress" })],
      now
    );
    expect(m.total).toBe(3);
    expect(m.completed).toBe(1);
    expect(m.overdue).toBe(1);
    expect(m.inProgress).toBe(1);
    expect(m.completionPct).toBe(33);
  });
  it("sorts by priority then due date", () => {
    const a = core({ priority: "low", due_date: "2026-01-01" });
    const b = core({ priority: "critical", due_date: "2026-12-01" });
    expect(compareWTasks(a, b)).toBeGreaterThan(0); // critical first
  });
});
