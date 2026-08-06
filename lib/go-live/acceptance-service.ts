import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recomputeScores } from "./verification-service";

/**
 * سير قبول الأعمال (Business Acceptance Workflow) — اعتماد الأقسام والفروع
 * بشكل مستقل + UAT + المشكلات. كل اعتماد يُسجَّل مع هوية المعتمِد ودوره
 * (Auditable)، ويُعيد حساب الدرجات فورًا.
 */

type Decision = "approved" | "rejected";

export async function decideDepartment(departmentId: string, decision: Decision, notes: string, actorId: string | null, actorRole: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; verificationId?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("go_live_departments").update({ status: decision, notes, decided_by: actorId, decided_role: actorRole, decided_at: new Date().toISOString() }).eq("id", departmentId).select("verification_id").maybeSingle();
  if (upd.error || !upd.data) return { ok: false, message: upd.error?.message ?? "القسم غير موجود." };
  const verificationId = (upd.data as { verification_id: string }).verification_id;
  await recomputeScores(verificationId, db);
  return { ok: true, verificationId, message: decision === "approved" ? "اعتُمد القسم." : "رُفض القسم." };
}

export async function addBranch(verificationId: string, branchName: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  if (!branchName.trim()) return { ok: false, message: "اسم الفرع مطلوب." };
  const ins = await db.from("go_live_branches").insert({ verification_id: verificationId, branch_name: branchName.trim(), status: "pending" });
  if (ins.error) return { ok: false, message: ins.error.message };
  await recomputeScores(verificationId, db);
  return { ok: true, message: "أُضيف الفرع." };
}

export async function decideBranch(branchId: string, decision: Decision, notes: string, actorId: string | null, actorRole: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; verificationId?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("go_live_branches").update({ status: decision, notes, decided_by: actorId, decided_role: actorRole, decided_at: new Date().toISOString() }).eq("id", branchId).select("verification_id").maybeSingle();
  if (upd.error || !upd.data) return { ok: false, message: upd.error?.message ?? "الفرع غير موجود." };
  const verificationId = (upd.data as { verification_id: string }).verification_id;
  await recomputeScores(verificationId, db);
  return { ok: true, verificationId, message: decision === "approved" ? "اعتُمد الفرع." : "رُفض الفرع." };
}

export async function recordUat(verificationId: string, scenario: string, verdict: "pass" | "fail" | "comment" | "issue", comment: string, actorId: string | null, actorRole: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const ins = await db.from("go_live_uat").insert({ verification_id: verificationId, scenario, verdict, comment, created_by: actorId, actor_role: actorRole });
  if (ins.error) return { ok: false, message: ins.error.message };
  // فشل UAT أو مشكلة → افتح مشكلة تلقائيًا.
  if (verdict === "fail" || verdict === "issue") {
    await db.from("go_live_issues").insert({ verification_id: verificationId, title: `UAT: ${scenario}`, severity: verdict === "fail" ? "high" : "medium", status: "open", detail: comment, reported_by: actorId });
    await recomputeScores(verificationId, db);
  }
  return { ok: true, message: "سُجِّل UAT." };
}

export async function reportIssue(verificationId: string, title: string, severity: "critical" | "high" | "medium" | "low", detail: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  if (!title.trim()) return { ok: false, message: "عنوان المشكلة مطلوب." };
  const ins = await db.from("go_live_issues").insert({ verification_id: verificationId, title: title.trim(), severity, status: "open", detail, reported_by: actorId });
  if (ins.error) return { ok: false, message: ins.error.message };
  await recomputeScores(verificationId, db);
  return { ok: true, message: "سُجِّلت المشكلة." };
}

export async function closeIssue(issueId: string, resolution: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("go_live_issues").update({ status: "closed", resolution, closed_by: actorId, closed_at: new Date().toISOString() }).eq("id", issueId).select("verification_id").maybeSingle();
  if (upd.error || !upd.data) return { ok: false, message: upd.error?.message ?? "المشكلة غير موجودة." };
  await recomputeScores((upd.data as { verification_id: string }).verification_id, db);
  return { ok: true, message: "أُغلقت المشكلة." };
}
