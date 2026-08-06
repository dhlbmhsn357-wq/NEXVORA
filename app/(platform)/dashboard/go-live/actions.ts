"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { getGoLiveDashboard, getVerificationDetail, type GoLiveDashboard } from "@/lib/go-live/dashboard";
import { runVerification } from "@/lib/go-live/verification-service";
import { decideDepartment, addBranch, decideBranch, recordUat, reportIssue, closeIssue } from "@/lib/go-live/acceptance-service";
import { issueCertificate } from "@/lib/go-live/certificate-service";
import type { KpiPair } from "@/lib/go-live/verification-types";
import { notifyGoLive } from "@/lib/go-live/notify";

/**
 * إجراءات مركز التحقّق وقبول الأعمال وشهادة الإطلاق (Go Live Validation).
 * Director: اعتماد الإطلاق (الشهادة). Admin: إدارة التحقّق. Supervisor:
 * مراجعة/اعتماد أقسام وفروع وUAT. Executor: لا اعتماد. كل اعتماد Auditable.
 */

const CERTIFIER = ["owner", "admin"] as const;
const APPROVER = ["owner", "admin", "supervisor"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: GoLiveDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getGoLiveDashboard(projectId) };
}

export async function startVerification(executionId: string, kpis: KpiPair[]): Promise<{ ok: boolean; message?: string; verificationId?: string }> {
  const auth = await requireRole([...CERTIFIER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const r = await runVerification(executionId, kpis ?? [], auth.userId ?? null);
  if (r.ok && r.verificationId) {
    const vid = r.verificationId;
    after(async () => { await notifyGoLive("verification_started", vid, "بدأ التحقّق بعد الترحيل وقبول الأعمال.", null); });
  }
  return r;
}

export async function getDetail(verificationId: string): Promise<{ ok: boolean; detail?: unknown }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, detail: await getVerificationDetail(verificationId) };
}

export async function approveDepartment(departmentId: string, decision: "approved" | "rejected", notes: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...APPROVER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideDepartment(departmentId, decision, notes, auth.userId ?? null, auth.role ?? "supervisor");
}

export async function createBranch(verificationId: string, branchName: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...APPROVER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return addBranch(verificationId, branchName);
}

export async function approveBranch(branchId: string, decision: "approved" | "rejected", notes: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...APPROVER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideBranch(branchId, decision, notes, auth.userId ?? null, auth.role ?? "supervisor");
}

export async function submitUat(verificationId: string, scenario: string, verdict: "pass" | "fail" | "comment" | "issue", comment: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...APPROVER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return recordUat(verificationId, scenario, verdict, comment, auth.userId ?? null, auth.role ?? "supervisor");
}

export async function raiseIssue(verificationId: string, title: string, severity: "critical" | "high" | "medium" | "low", detail: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...APPROVER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return reportIssue(verificationId, title, severity, detail, auth.userId ?? null);
}

export async function resolveIssue(issueId: string, resolution: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...CERTIFIER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return closeIssue(issueId, resolution, auth.userId ?? null);
}

export async function certify(verificationId: string): Promise<{ ok: boolean; message?: string; blockers?: string[]; certificateId?: string }> {
  const auth = await requireRole([...CERTIFIER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return issueCertificate(verificationId, auth.role ?? "admin", auth.userId ?? null);
}
