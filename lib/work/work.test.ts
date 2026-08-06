import { describe, it, expect } from "vitest";
import {
  checkDependencyGate, isOverdue, isCriticalOverdue, checklistProgress,
  computeTaskProgress, computeMilestoneProgress,
} from "./task-logic";
import {
  canCreateTask, canAssignTask, canDeleteTask, canApproveMilestone, canUpdateTask,
} from "./permissions";
import { isTerminalStatus, isDoneStatus, PRIORITY_ORDER } from "./statuses";

const NOW = new Date("2026-07-26T00:00:00Z").getTime();

describe("task dependency gate", () => {
  it("يمنع البدء لو تبعية مش مكتملة", () => {
    const g = checkDependencyGate("in_progress", [{ id: "a", status: "in_progress" }]);
    expect(g.allowed).toBe(false);
    expect(g.blockingTaskIds).toEqual(["a"]);
  });
  it("يسمح بالبدء لو كل التبعيات مكتملة", () => {
    const g = checkDependencyGate("in_progress", [{ id: "a", status: "completed" }]);
    expect(g.allowed).toBe(true);
  });
  it("الحالات غير التنفيذية (planned/ready) مسموحة دايمًا", () => {
    expect(checkDependencyGate("ready", [{ id: "a", status: "backlog" }]).allowed).toBe(true);
  });
});

describe("overdue detection", () => {
  it("مهمة فات موعدها ومش نهائية = متأخرة", () => {
    expect(isOverdue({ due_date: "2026-07-20", status: "in_progress" }, NOW)).toBe(true);
  });
  it("مهمة مكتملة مش متأخرة حتى لو فات الموعد", () => {
    expect(isOverdue({ due_date: "2026-07-20", status: "completed" }, NOW)).toBe(false);
  });
  it("مهمة بدون موعد مش متأخرة", () => {
    expect(isOverdue({ due_date: null, status: "in_progress" }, NOW)).toBe(false);
  });
  it("حرجة + متأخرة", () => {
    expect(isCriticalOverdue({ due_date: "2026-07-20", status: "in_progress", priority: "critical" }, NOW)).toBe(true);
    expect(isCriticalOverdue({ due_date: "2026-07-20", status: "in_progress", priority: "high" }, NOW)).toBe(false);
  });
});

describe("progress rollup", () => {
  it("checklist progress", () => {
    expect(checklistProgress([{ text: "a", done: true }, { text: "b", done: false }])).toBe(50);
    expect(checklistProgress([])).toBe(0);
  });
  it("مهمة مكتملة = 100", () => {
    expect(computeTaskProgress({ status: "completed", checklist: [] }, [])).toBe(100);
  });
  it("مهمة بـ subtasks = متوسط نسبهم", () => {
    expect(computeTaskProgress({ status: "in_progress", checklist: [] }, [100, 0])).toBe(50);
  });
  it("مهمة بدون subtasks = نسبة الـ checklist", () => {
    expect(computeTaskProgress({ status: "in_progress", checklist: [{ text: "a", done: true }] }, [])).toBe(100);
  });
  it("milestone = متوسط مهامه", () => {
    expect(computeMilestoneProgress([100, 50, 0])).toBe(50);
    expect(computeMilestoneProgress([])).toBe(0);
  });
});

describe("statuses helpers", () => {
  it("terminal/done", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("in_progress")).toBe(false);
    expect(isDoneStatus("completed")).toBe(true);
    expect(isDoneStatus("cancelled")).toBe(false);
  });
  it("priority order critical أعلى", () => {
    expect(PRIORITY_ORDER.critical).toBeLessThan(PRIORITY_ORDER.low);
  });
});

describe("work permissions (hierarchical)", () => {
  it("إنشاء المهام لأي عضو", () => {
    expect(canCreateTask("member")).toBe(true);
  });
  it("التعيين للمشرف فأعلى", () => {
    expect(canAssignTask("supervisor")).toBe(true);
    expect(canAssignTask("member")).toBe(false);
  });
  it("الحذف واعتماد Milestone للمسؤول فأعلى", () => {
    expect(canDeleteTask("admin")).toBe(true);
    expect(canDeleteTask("supervisor")).toBe(false);
    expect(canApproveMilestone("admin")).toBe(true);
    expect(canApproveMilestone("supervisor")).toBe(false);
  });
  it("تحديث المهمة: صاحبها أو مكلّف بها أو مشرف", () => {
    expect(canUpdateTask("member", "u1", [], "u1")).toBe(true); // صاحبها
    expect(canUpdateTask("member", "u1", ["u2"], "u2")).toBe(true); // مكلّف
    expect(canUpdateTask("member", "u1", ["u3"], "u2")).toBe(false); // ولا ده ولا ده
    expect(canUpdateTask("supervisor", "u1", [], "u2")).toBe(true); // مشرف
  });
});
