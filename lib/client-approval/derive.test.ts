import { describe, expect, it } from "vitest";
import { effectiveStatus, canDecide, summarizeApprovals, countAuditEvents } from "./derive";
import type { ClientApprovalRow, ApprovalAuditRow } from "./types";

const NOW = "2026-08-08T10:00:00.000Z";
function row(over: Partial<ClientApprovalRow>): ClientApprovalRow {
  return {
    id: "a", projectId: "p", publicToken: "t", targetType: "prd",
    targetId: null, targetVersion: null, title: "PRD", summary: "",
    clientName: "", clientEmail: "", status: "pending",
    decision: null, decisionNote: "", decidedAt: null,
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null, revokedBy: null, revokeReason: "",
    createdAt: NOW, createdBy: null, ...over,
  };
}

describe("effectiveStatus", () => {
  it("revoked يفضل revoked", () => {
    expect(effectiveStatus(row({ status: "revoked", revokedAt: NOW }), NOW)).toBe("revoked");
  });
  it("decided يفضل decided", () => {
    expect(effectiveStatus(row({ status: "decided" }), NOW)).toBe("decided");
  });
  it("pending + expired ≤ now = expired", () => {
    expect(effectiveStatus(row({ status: "pending", expiresAt: "2020-01-01T00:00:00.000Z" }), NOW)).toBe("expired");
  });
  it("pending + future expiry = pending", () => {
    expect(effectiveStatus(row({ status: "pending", expiresAt: "2099-01-01T00:00:00.000Z" }), NOW)).toBe("pending");
  });
});

describe("canDecide", () => {
  it("pending فقط", () => {
    expect(canDecide(row({ status: "pending" }), NOW)).toBe(true);
    expect(canDecide(row({ status: "decided" }), NOW)).toBe(false);
    expect(canDecide(row({ status: "revoked", revokedAt: NOW }), NOW)).toBe(false);
    expect(canDecide(row({ status: "pending", expiresAt: "2020-01-01T00:00:00.000Z" }), NOW)).toBe(false);
  });
});

describe("summarizeApprovals", () => {
  it("يحسب كل الحالات بدقة", () => {
    const s = summarizeApprovals([
      row({ status: "pending" }),
      row({ status: "decided", decision: "approved" }),
      row({ status: "decided", decision: "rejected" }),
      row({ status: "decided", decision: "changes_requested" }),
      row({ status: "pending", expiresAt: "2020-01-01T00:00:00.000Z" }),
      row({ status: "revoked", revokedAt: NOW }),
    ], NOW);
    expect(s.total).toBe(6);
    expect(s.pending).toBe(1);
    expect(s.approved).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.changesRequested).toBe(1);
    expect(s.expired).toBe(1);
    expect(s.revoked).toBe(1);
  });
});

describe("countAuditEvents", () => {
  it("يجمع الأحداث حسب النوع", () => {
    const rows: ApprovalAuditRow[] = [
      { id: "1", approvalId: "a", projectId: "p", eventType: "viewed", eventMeta: {}, actor: "", createdAt: NOW },
      { id: "2", approvalId: "a", projectId: "p", eventType: "viewed", eventMeta: {}, actor: "", createdAt: NOW },
      { id: "3", approvalId: "a", projectId: "p", eventType: "decided", eventMeta: {}, actor: "", createdAt: NOW },
    ];
    const c = countAuditEvents(rows);
    expect(c.viewed).toBe(2);
    expect(c.decided).toBe(1);
    expect(c.revoked).toBe(0);
  });
});
