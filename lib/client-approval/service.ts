/**
 * NEXVORA Client Approval Portal — Data Access (P11)
 * ==================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 *
 * ملاحظة: قراءة approval بالـ token عامة (بدون auth) — تستخدم service client
 * لتخطي RLS، لأن العميل مش مسجّل دخول أصلًا.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ClientApprovalRow, ApprovalAuditRow,
  ApprovalTargetType, ApprovalStatus, ApprovalDecision, AuditEventType,
} from "./types";

type DbApproval = {
  id: string; project_id: string; public_token: string;
  target_type: ApprovalTargetType; target_id: string | null; target_version: number | null;
  title: string; summary: string; client_name: string; client_email: string;
  status: ApprovalStatus; decision: ApprovalDecision | null; decision_note: string;
  decided_at: string | null; expires_at: string;
  revoked_at: string | null; revoked_by: string | null; revoke_reason: string;
  created_at: string; created_by: string | null;
};

function mapApproval(r: DbApproval): ClientApprovalRow {
  return {
    id: r.id, projectId: r.project_id, publicToken: r.public_token,
    targetType: r.target_type, targetId: r.target_id, targetVersion: r.target_version,
    title: r.title, summary: r.summary, clientName: r.client_name, clientEmail: r.client_email,
    status: r.status, decision: r.decision, decisionNote: r.decision_note,
    decidedAt: r.decided_at, expiresAt: r.expires_at,
    revokedAt: r.revoked_at, revokedBy: r.revoked_by, revokeReason: r.revoke_reason,
    createdAt: r.created_at, createdBy: r.created_by,
  };
}

type DbAudit = {
  id: string; approval_id: string; project_id: string;
  event_type: AuditEventType; event_meta: Record<string, unknown>;
  actor: string; created_at: string;
};
function mapAudit(r: DbAudit): ApprovalAuditRow {
  return {
    id: r.id, approvalId: r.approval_id, projectId: r.project_id,
    eventType: r.event_type, eventMeta: r.event_meta ?? {},
    actor: r.actor, createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function listApprovals(projectId: string): Promise<ClientApprovalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_approvals").select("*").eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbApproval[]).map(mapApproval);
}

/** قراءة عامة بالـ token — يُستخدم service client لتخطي RLS. */
export async function getApprovalByToken(token: string): Promise<ClientApprovalRow | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("client_approvals").select("*").eq("public_token", token).maybeSingle();
  if (error) throw error;
  return data ? mapApproval(data as DbApproval) : null;
}

export async function listAudit(approvalId: string): Promise<ApprovalAuditRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_approval_audit").select("*").eq("approval_id", approvalId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbAudit[]).map(mapAudit);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
export interface ApprovalInput {
  targetType: ApprovalTargetType;
  targetId?: string | null;
  targetVersion?: number | null;
  title: string;
  summary?: string;
  clientName?: string;
  clientEmail?: string;
  /** عدد الأيام للانتهاء — الافتراضي 14 يومًا. */
  expiresInDays?: number;
}

export async function createApproval(
  projectId: string,
  input: ApprovalInput,
  createdBy: string | null,
): Promise<ClientApprovalRow> {
  const svc = createServiceClient();
  const publicToken = randomBytes(32).toString("hex");
  const days = input.expiresInDays ?? 14;
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();

  const { data, error } = await svc.from("client_approvals").insert({
    project_id: projectId,
    public_token: publicToken,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    target_version: input.targetVersion ?? null,
    title: input.title,
    summary: input.summary ?? "",
    client_name: input.clientName ?? "",
    client_email: input.clientEmail ?? "",
    status: "pending",
    expires_at: expiresAt,
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapApproval(data as DbApproval);
}

export async function recordDecision(
  approvalId: string,
  decision: ApprovalDecision,
  note: string,
  actor: string,
): Promise<ClientApprovalRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("client_approvals").update({
    status: "decided",
    decision,
    decision_note: note,
    decided_at: new Date().toISOString(),
  }).eq("id", approvalId).select("*").single();
  if (error) throw error;
  // اترك سجل audit
  await logAudit(approvalId, (data as DbApproval).project_id, "decided", { decision, note }, actor);
  return mapApproval(data as DbApproval);
}

export async function revokeApproval(
  id: string, reason: string, revokedBy: string | null,
): Promise<void> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("client_approvals").update({
    status: "revoked",
    revoked_at: new Date().toISOString(),
    revoked_by: revokedBy,
    revoke_reason: reason,
  }).eq("id", id).select("project_id").single();
  if (error) throw error;
  const projectId = (data as { project_id: string }).project_id;
  await logAudit(id, projectId, "revoked", { reason }, revokedBy ?? "system");
}

export async function logAudit(
  approvalId: string,
  projectId: string,
  event: AuditEventType,
  meta: Record<string, unknown>,
  actor: string,
): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("client_approval_audit").insert({
    approval_id: approvalId,
    project_id: projectId,
    event_type: event,
    event_meta: meta ?? {},
    actor: actor || "system",
  });
  if (error) throw error;
}
