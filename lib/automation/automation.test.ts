import { describe, it, expect } from "vitest";
import { computeEscalationTier, escalationDecision, daysBetween } from "./escalation";
import { EVENT_TYPES } from "./events";
import { WORKFLOW_REGISTRY, workflowsForEvent, shouldRun } from "./workflow-registry";

describe("escalation tiers", () => {
  it("no escalation for 0-1 days overdue", () => {
    expect(computeEscalationTier(0)).toBe("none");
    expect(computeEscalationTier(1)).toBe("none");
  });
  it("supervisor for 2-3 days", () => {
    expect(computeEscalationTier(2)).toBe("supervisor");
    expect(computeEscalationTier(3)).toBe("supervisor");
  });
  it("admin for 4-6 days", () => {
    expect(computeEscalationTier(4)).toBe("admin");
    expect(computeEscalationTier(6)).toBe("admin");
  });
  it("owner for 7+ days", () => {
    expect(computeEscalationTier(7)).toBe("owner");
    expect(computeEscalationTier(30)).toBe("owner");
  });
});

describe("escalation decision", () => {
  it("escalates severity and only creates risk tasks at admin+", () => {
    expect(escalationDecision(1)).toMatchObject({ tier: "none", severity: "info", createRiskTask: false });
    expect(escalationDecision(2)).toMatchObject({ tier: "supervisor", severity: "warning", createRiskTask: false });
    expect(escalationDecision(5)).toMatchObject({ tier: "admin", severity: "critical", createRiskTask: true });
    expect(escalationDecision(10)).toMatchObject({ tier: "owner", severity: "critical", createRiskTask: true });
  });
});

describe("daysBetween", () => {
  it("computes whole days elapsed", () => {
    const now = new Date("2026-01-10T00:00:00Z").getTime();
    expect(daysBetween("2026-01-05", now)).toBe(5);
    expect(daysBetween("2026-01-10", now)).toBe(0);
  });
  it("returns 0 for invalid dates", () => {
    expect(daysBetween("not-a-date", Date.parse("2026-01-10"))).toBe(0);
  });
});

describe("workflow registry", () => {
  it("has unique workflow ids", () => {
    const ids = WORKFLOW_REGISTRY.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("routes events to the right workflows", () => {
    expect(workflowsForEvent(EVENT_TYPES.DELIVERY_APPROVED).map((w) => w.id)).toContain("wf_delivery_approved");
    expect(workflowsForEvent(EVENT_TYPES.ENGINEERING_QA_FAILED).map((w) => w.id)).toContain("wf_engineering_qa_failed");
  });

  it("delivery-approved condition gates on status", () => {
    const wf = WORKFLOW_REGISTRY.find((w) => w.id === "wf_delivery_approved")!;
    const base = { type: EVENT_TYPES.DELIVERY_APPROVED, projectId: "p1", actorId: "u1", recordId: "m1" };
    expect(shouldRun(wf, { ...base, payload: { status: "approved" } })).toBe(true);
    expect(shouldRun(wf, { ...base, payload: { status: "client_approved" } })).toBe(true);
    expect(shouldRun(wf, { ...base, payload: { status: "draft" } })).toBe(false);
  });

  it("engineering-qa-failed builds a critical task + critical notification", () => {
    const wf = WORKFLOW_REGISTRY.find((w) => w.id === "wf_engineering_qa_failed")!;
    const specs = wf.buildActions({
      type: EVENT_TYPES.ENGINEERING_QA_FAILED,
      projectId: "p1",
      actorId: "u1",
      recordId: "r9",
      payload: { projectName: "متجر", reviewNumber: "3" },
    });
    const task = specs.find((s) => s.kind === "create_task");
    const notify = specs.find((s) => s.kind === "notify");
    expect(task).toMatchObject({ priority: "critical", sourceType: "eqa_finding", sourceReference: "eqa-failed-r9" });
    expect(notify).toMatchObject({ severity: "critical" });
    expect(specs.some((s) => s.kind === "timeline")).toBe(true);
  });

  it("delivery-rejected creates a remediation task", () => {
    const wf = WORKFLOW_REGISTRY.find((w) => w.id === "wf_delivery_rejected")!;
    const specs = wf.buildActions({
      type: EVENT_TYPES.DELIVERY_REJECTED,
      projectId: "p1",
      actorId: "u1",
      recordId: "m2",
      payload: { status: "changes_requested", milestoneTitle: "MVP", projectName: "متجر" },
    });
    expect(specs.some((s) => s.kind === "create_task" && s.sourceReference === "delivery-changes-m2")).toBe(true);
  });

  it("every workflow yields at least a timeline action", () => {
    for (const wf of WORKFLOW_REGISTRY) {
      const specs = wf.buildActions({ type: wf.trigger, projectId: "p1", actorId: "u1", recordId: "x", payload: {} });
      expect(specs.some((s) => s.kind === "timeline")).toBe(true);
    }
  });
});
