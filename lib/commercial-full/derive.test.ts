import { describe, expect, it } from "vitest";
import {
  computeProposalTotals, computeLineTotal,
  isProposalTransitionAllowed, isCrTransitionAllowed,
  summarizeProposals, summarizeChangeRequests,
} from "./derive";
import type { ProposalRow, ChangeRequestRow } from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function prop(over: Partial<ProposalRow>): ProposalRow {
  return {
    id: "p", projectId: "prj", version: 1, title: "t", summary: "",
    status: "draft", currency: "EGP",
    subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0,
    validUntil: null, sentAt: null, acceptedAt: null, rejectedAt: null,
    linkedPackageId: null, notes: "",
    createdAt: NOW, updatedAt: NOW, createdBy: null, ...over,
  };
}
function cr(over: Partial<ChangeRequestRow>): ChangeRequestRow {
  return {
    id: "c", projectId: "prj", code: null, title: "t", description: "",
    reason: "", impactScope: "", impactCost: 0, impactTimeDays: 0,
    status: "draft", requestedBy: "",
    linkedContractId: null, linkedProposalId: null,
    decidedAt: null, decidedBy: null, decisionNote: "",
    createdAt: NOW, updatedAt: NOW, createdBy: null, ...over,
  };
}

describe("computeProposalTotals", () => {
  it("فاضي = صفر", () => {
    const t = computeProposalTotals([]);
    expect(t.subtotal).toBe(0);
    expect(t.totalAmount).toBe(0);
  });
  it("يجمع bands + خصم + ضريبة", () => {
    const t = computeProposalTotals(
      [{ quantity: 2, unitPrice: 100 }, { quantity: 1, unitPrice: 250 }],
      50, 22.5,
    );
    // subtotal = 200 + 250 = 450، بعد الخصم 400، + ضريبة = 422.5
    expect(t.subtotal).toBe(450);
    expect(t.totalAmount).toBe(422.5);
  });
  it("الخصم أكبر من subtotal لا يعطي سالب", () => {
    const t = computeProposalTotals([{ quantity: 1, unitPrice: 100 }], 500);
    expect(t.totalAmount).toBe(0);
  });
});

describe("computeLineTotal", () => {
  it("يقرّب لخانتين عشريتين", () => {
    expect(computeLineTotal(3, 33.333)).toBe(100);
    expect(computeLineTotal(2, 33.33)).toBe(66.66);
  });
});

describe("proposal transitions", () => {
  it("draft → sent مسموح", () => {
    expect(isProposalTransitionAllowed("draft", "sent")).toBe(true);
  });
  it("draft → accepted ممنوع (لازم sent أولاً)", () => {
    expect(isProposalTransitionAllowed("draft", "accepted")).toBe(false);
  });
  it("accepted → sent ممنوع (نهائي)", () => {
    expect(isProposalTransitionAllowed("accepted", "sent")).toBe(false);
    expect(isProposalTransitionAllowed("accepted", "superseded")).toBe(true);
  });
});

describe("change request transitions", () => {
  it("draft → submitted → under_review → approved", () => {
    expect(isCrTransitionAllowed("draft", "submitted")).toBe(true);
    expect(isCrTransitionAllowed("submitted", "under_review")).toBe(true);
    expect(isCrTransitionAllowed("under_review", "approved")).toBe(true);
    expect(isCrTransitionAllowed("approved", "implemented")).toBe(true);
  });
  it("rejected/cancelled/implemented نهائيّة", () => {
    expect(isCrTransitionAllowed("rejected", "approved")).toBe(false);
    expect(isCrTransitionAllowed("implemented", "draft")).toBe(false);
  });
});

describe("summarizeProposals", () => {
  it("يجمع القيم المقبولة حسب العملة", () => {
    const s = summarizeProposals([
      prop({ status: "accepted", currency: "EGP", totalAmount: 1000 }),
      prop({ status: "accepted", currency: "EGP", totalAmount: 500 }),
      prop({ status: "accepted", currency: "USD", totalAmount: 300 }),
      prop({ status: "rejected", currency: "EGP", totalAmount: 999 }),
      prop({ status: "draft" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.byStatus.accepted).toBe(3);
    expect(s.byStatus.rejected).toBe(1);
    expect(s.acceptedValueByCurrency.EGP).toBe(1500);
    expect(s.acceptedValueByCurrency.USD).toBe(300);
  });
  it("latestVersion = أكبر version", () => {
    const s = summarizeProposals([prop({ version: 1 }), prop({ version: 3 }), prop({ version: 2 })]);
    expect(s.latestVersion).toBe(3);
  });
});

describe("summarizeChangeRequests", () => {
  it("يجمع تأثير approved + implemented فقط", () => {
    const s = summarizeChangeRequests([
      cr({ status: "approved", impactCost: 1000, impactTimeDays: 5 }),
      cr({ status: "implemented", impactCost: 500, impactTimeDays: 3 }),
      cr({ status: "rejected", impactCost: 999, impactTimeDays: 99 }),
      cr({ status: "draft", impactCost: 100, impactTimeDays: 2 }),
    ]);
    expect(s.totalApprovedImpactCost).toBe(1500);
    expect(s.totalApprovedImpactDays).toBe(8);
    expect(s.pending).toBe(1); // draft
  });
});
