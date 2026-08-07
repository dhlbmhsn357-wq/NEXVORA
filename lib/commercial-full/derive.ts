/**
 * NEXVORA Commercial Full — Pure Derivations (P10)
 */
import type {
  ProposalRow, ProposalItemRow, ChangeRequestRow,
  ProposalStatus, ChangeRequestStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Proposal math (single source of truth للحسبة)
// ---------------------------------------------------------------------------
export interface ComputedTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * subtotal = مجموع line_total للبنود
 * total = subtotal - discount + tax (لا يقل عن 0)
 */
export function computeProposalTotals(
  items: readonly Pick<ProposalItemRow, "quantity" | "unitPrice">[],
  discountAmount = 0,
  taxAmount = 0,
): ComputedTotals {
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);
  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxAmount: round2(taxAmount),
    totalAmount: round2(total),
  };
}

export function computeLineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Proposal status transitions
// ---------------------------------------------------------------------------
/**
 * الانتقالات المسموحة. draft → sent → accepted/rejected/expired.
 * accepted/rejected نهائيّة (نستخدم superseded لو أُصدرت نسخة جديدة).
 */
export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["sent", "superseded"],
  sent: ["accepted", "rejected", "expired", "superseded"],
  accepted: ["superseded"],
  rejected: ["superseded"],
  expired: ["superseded"],
  superseded: [],
};

export function isProposalTransitionAllowed(from: ProposalStatus, to: ProposalStatus): boolean {
  return (PROPOSAL_TRANSITIONS[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// Change Request status transitions
// ---------------------------------------------------------------------------
export const CR_TRANSITIONS: Record<ChangeRequestStatus, readonly ChangeRequestStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["implemented", "cancelled"],
  rejected: [],
  cancelled: [],
  implemented: [],
};

export function isCrTransitionAllowed(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return (CR_TRANSITIONS[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------
export interface ProposalsSummary {
  total: number;
  byStatus: Record<ProposalStatus, number>;
  acceptedValueByCurrency: Record<string, number>;
  latestVersion: number;
}

const EMPTY_PROPOSAL_STATUS = (): Record<ProposalStatus, number> => ({
  draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0, superseded: 0,
});

export function summarizeProposals(rows: readonly ProposalRow[]): ProposalsSummary {
  const byStatus = EMPTY_PROPOSAL_STATUS();
  const acceptedValueByCurrency: Record<string, number> = {};
  let latestVersion = 0;
  for (const p of rows) {
    byStatus[p.status]++;
    if (p.status === "accepted") {
      acceptedValueByCurrency[p.currency] = round2((acceptedValueByCurrency[p.currency] ?? 0) + p.totalAmount);
    }
    if (p.version > latestVersion) latestVersion = p.version;
  }
  return { total: rows.length, byStatus, acceptedValueByCurrency, latestVersion };
}

export interface ChangeRequestsSummary {
  total: number;
  byStatus: Record<ChangeRequestStatus, number>;
  totalApprovedImpactCost: number;
  totalApprovedImpactDays: number;
  pending: number;   // draft + submitted + under_review
}

const EMPTY_CR_STATUS = (): Record<ChangeRequestStatus, number> => ({
  draft: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0, cancelled: 0, implemented: 0,
});

export function summarizeChangeRequests(rows: readonly ChangeRequestRow[]): ChangeRequestsSummary {
  const byStatus = EMPTY_CR_STATUS();
  let totalApprovedImpactCost = 0;
  let totalApprovedImpactDays = 0;
  for (const c of rows) {
    byStatus[c.status]++;
    if (c.status === "approved" || c.status === "implemented") {
      totalApprovedImpactCost += c.impactCost;
      totalApprovedImpactDays += c.impactTimeDays;
    }
  }
  return {
    total: rows.length,
    byStatus,
    totalApprovedImpactCost: round2(totalApprovedImpactCost),
    totalApprovedImpactDays,
    pending: byStatus.draft + byStatus.submitted + byStatus.under_review,
  };
}
