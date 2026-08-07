/** NEXVORA Commercial Full — Types (P10): Proposals + Pricing + Change Requests */

// ---------------------------------------------------------------------------
// Pricing Packages
// ---------------------------------------------------------------------------
export type PackageTier = "starter" | "standard" | "pro" | "enterprise" | "custom";
export const PACKAGE_TIERS: readonly PackageTier[] = ["starter","standard","pro","enterprise","custom"] as const;
export const PACKAGE_TIER_LABELS: Record<PackageTier, string> = {
  starter: "بداية", standard: "قياسي", pro: "احترافي", enterprise: "مؤسسي", custom: "مخصّص",
};
export interface PricingPackageRow {
  id: string;
  name: string;
  tier: PackageTier;
  description: string;
  basePrice: number;
  currency: string;
  features: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------
export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "superseded";
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  "draft","sent","accepted","rejected","expired","superseded",
] as const;
export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "مسودّة", sent: "مُرسَل", accepted: "مقبول",
  rejected: "مرفوض", expired: "منتهي الصلاحية", superseded: "استُبدل",
};

export interface ProposalRow {
  id: string;
  projectId: string;
  version: number;
  title: string;
  summary: string;
  status: ProposalStatus;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  linkedPackageId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface ProposalItemRow {
  id: string;
  proposalId: string;
  projectId: string;
  orderIndex: number;
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Change Requests
// ---------------------------------------------------------------------------
export type ChangeRequestStatus =
  | "draft" | "submitted" | "under_review" | "approved" | "rejected" | "cancelled" | "implemented";
export const CHANGE_REQUEST_STATUSES: readonly ChangeRequestStatus[] = [
  "draft","submitted","under_review","approved","rejected","cancelled","implemented",
] as const;
export const CR_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  draft: "مسودّة", submitted: "مُرسَل", under_review: "قيد المراجعة",
  approved: "موافَق", rejected: "مرفوض", cancelled: "ملغى", implemented: "منفّذ",
};

export interface ChangeRequestRow {
  id: string;
  projectId: string;
  code: string | null;
  title: string;
  description: string;
  reason: string;
  impactScope: string;
  impactCost: number;
  impactTimeDays: number;
  status: ChangeRequestStatus;
  requestedBy: string;
  linkedContractId: string | null;
  linkedProposalId: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
