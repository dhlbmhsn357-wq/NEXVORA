/**
 * NEXVORA Client Approval — Pure Derivations (P11)
 * Deterministic checks for expiry/revoked/decidable + token generation contract.
 */
import type { ClientApprovalRow, ApprovalAuditRow, AuditEventType } from "./types";

/** Effective status accounting for expiry (row.status could be pending but expired now). */
export function effectiveStatus(
  row: Pick<ClientApprovalRow, "status" | "expiresAt" | "revokedAt">,
  nowISO: string,
): ClientApprovalRow["status"] {
  if (row.status === "revoked" || row.revokedAt) return "revoked";
  if (row.status === "decided") return "decided";
  if (row.expiresAt && row.expiresAt < nowISO) return "expired";
  return "pending";
}

/** يقدر يقرّر = pending وغير منتهي وغير ملغى. */
export function canDecide(row: ClientApprovalRow, nowISO: string): boolean {
  return effectiveStatus(row, nowISO) === "pending";
}

export interface ApprovalsSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  expired: number;
  revoked: number;
}
export function summarizeApprovals(rows: readonly ClientApprovalRow[], nowISO: string): ApprovalsSummary {
  const s: ApprovalsSummary = { total: rows.length, pending: 0, approved: 0, rejected: 0, changesRequested: 0, expired: 0, revoked: 0 };
  for (const r of rows) {
    const eff = effectiveStatus(r, nowISO);
    if (eff === "revoked") s.revoked++;
    else if (eff === "expired") s.expired++;
    else if (eff === "pending") s.pending++;
    else if (r.decision === "approved") s.approved++;
    else if (r.decision === "rejected") s.rejected++;
    else if (r.decision === "changes_requested") s.changesRequested++;
  }
  return s;
}

export function countAuditEvents(rows: readonly ApprovalAuditRow[]): Record<AuditEventType, number> {
  const c: Record<AuditEventType, number> = { viewed: 0, decided: 0, revoked: 0, link_shared: 0, expired: 0 };
  for (const r of rows) c[r.eventType]++;
  return c;
}
