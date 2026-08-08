/** NEXVORA Client Approval Portal — Types (P11) */

/**
 * أنواع أهداف اعتماد العميل.
 * ملاحظة (0106): `brain` = ملخّص Brain المعتمَد (Brain Summary)، وليس وثيقة Brain
 * الداخلية. هو محجوز لميزة مستقبلية ولا يُعرض في UI إنشاء الاعتمادات الحالي
 * (اُنظر client-approval-panel.tsx). القيمة تبقى صالحة في السكيمة للتوافق.
 */
export type ApprovalTargetType = "prd" | "presentation" | "proposal" | "brain";
export const APPROVAL_TARGET_TYPES: readonly ApprovalTargetType[] = ["prd", "presentation", "proposal", "brain"] as const;
export const APPROVAL_TARGET_LABELS: Record<ApprovalTargetType, string> = {
  prd: "PRD", presentation: "عرض العميل", proposal: "عرض تجاري", brain: "Brain",
};

export type ApprovalStatus = "pending" | "decided" | "expired" | "revoked";
export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "decided", "expired", "revoked"] as const;
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "معلّق", decided: "تمّ القرار", expired: "منتهي الصلاحية", revoked: "ملغى",
};

export type ApprovalDecision = "approved" | "rejected" | "changes_requested";
export const APPROVAL_DECISIONS: readonly ApprovalDecision[] = ["approved", "rejected", "changes_requested"] as const;
export const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
  approved: "معتمد", rejected: "مرفوض", changes_requested: "طلب تعديلات",
};

export interface ClientApprovalRow {
  id: string;
  projectId: string;
  publicToken: string;
  targetType: ApprovalTargetType;
  targetId: string | null;
  targetVersion: number | null;
  title: string;
  summary: string;
  clientName: string;
  clientEmail: string;
  status: ApprovalStatus;
  decision: ApprovalDecision | null;
  decisionNote: string;
  decidedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string;
  createdAt: string;
  createdBy: string | null;
}

export type AuditEventType = "viewed" | "decided" | "revoked" | "link_shared" | "expired";
export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  viewed: "مُشاهدة", decided: "قرار", revoked: "إلغاء", link_shared: "مشاركة", expired: "انتهاء",
};

export interface ApprovalAuditRow {
  id: string;
  approvalId: string;
  projectId: string;
  eventType: AuditEventType;
  eventMeta: Record<string, unknown>;
  actor: string;
  createdAt: string;
}
