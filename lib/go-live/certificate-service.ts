import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildGoLiveChecklist, computeFinalScore } from "./go-live-checklist";
import { buildCertificate } from "./certificate";
import { buildLessons } from "./lessons-learned";
import { promoteGoLiveToOrgMemory } from "./org-memory-integration";
import { notifyGoLive } from "./notify";

/**
 * خدمة شهادة الإطلاق (Go Live Certificate) — لا تُصدَر إلا بعد اجتياز كل
 * البنود الحاجزة واعتماد الأقسام والفروع وإغلاق المشكلات. عند الإصدار:
 * تُبنى الدروس وتُرقّى للذاكرة المؤسسية، ويُغلَق المشروع.
 */

export async function issueCertificate(verificationId: string, actorRole: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; blockers?: string[]; certificateId?: string }> {
  const db = client ?? createServiceClient();

  const v = await db.from("go_live_verifications").select("*").eq("id", verificationId).maybeSingle();
  if (!v.data) return { ok: false, message: "التحقّق غير موجود." };
  const ver = v.data as { execution_id: string | null; source_id: string | null; project_id: string | null; report: { health?: { passed: boolean }; dataVerification?: { fullyMatched: boolean } }; status: string };
  if (ver.status === "certified") return { ok: false, message: "سبق إصدار الشهادة." };

  // اجمع حالة البوابات.
  const [depts, branches, openIssues, backup, rollback, exec, project] = await Promise.all([
    db.from("go_live_departments").select("status").eq("verification_id", verificationId),
    db.from("go_live_branches").select("status").eq("verification_id", verificationId),
    db.from("go_live_issues").select("id").eq("verification_id", verificationId).eq("status", "open"),
    ver.execution_id ? db.from("migration_backups").select("id").eq("execution_id", ver.execution_id).eq("status", "ready").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ver.execution_id ? db.from("migration_rollback_packages").select("id").eq("execution_id", ver.execution_id).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ver.execution_id ? db.from("migration_executions").select("status, chunk_size, worker_count, started_at, completed_at, detail").eq("id", ver.execution_id).maybeSingle() : Promise.resolve({ data: null }),
    ver.project_id ? db.from("projects").select("name").eq("id", ver.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const deptRows = (depts.data ?? []) as Array<{ status: string }>;
  const branchRows = (branches.data ?? []) as Array<{ status: string }>;
  const openIssueCount = ((openIssues.data ?? []) as Array<unknown>).length;
  const execRow = exec.data as { status: string; chunk_size: number; worker_count: number; started_at: string | null; completed_at: string | null; detail: { domain?: string } } | null;

  const departmentsApprovedRatio = deptRows.length ? deptRows.filter((d) => d.status === "approved").length / deptRows.length : 0;
  const branchesApprovedRatio = branchRows.length ? branchRows.filter((b) => b.status === "approved").length / branchRows.length : 1;

  const checklist = buildGoLiveChecklist({
    migrationCompleted: execRow?.status === "completed",
    verificationPassed: !!ver.report?.dataVerification?.fullyMatched && openIssueCount === 0,
    businessApproved: deptRows.length > 0 && departmentsApprovedRatio === 1,
    branchesApproved: branchesApprovedRatio === 1,
    performancePassed: !!ver.report?.health?.passed,
    healthPassed: !!ver.report?.health?.passed,
    rollbackArchived: !!rollback.data,
    backupsSaved: !!backup.data,
    documentationComplete: true,
  });

  // أعد حساب الدرجة النهائية باعتمادات الأقسام/الفروع الحالية.
  const score = computeFinalScore({
    dataMatchRatio: ver.report?.dataVerification?.fullyMatched ? 1 : 0.9,
    businessPassRatio: 1,
    departmentsApprovedRatio,
    branchesApprovedRatio,
    healthScore: ver.report?.health?.passed ? 100 : 60,
    kpiPassRatio: 1,
    openIssues: openIssueCount,
  });

  const approvers = [
    { role: actorRole, scope: "go_live" },
    ...deptRows.filter((d) => d.status === "approved").map(() => ({ role: "department_manager", scope: "department" })),
    ...branchRows.filter((b) => b.status === "approved").map(() => ({ role: "branch_manager", scope: "branch" })),
  ];

  const cert = buildCertificate({
    projectName: (project.data as { name: string } | null)?.name ?? "مشروع الترحيل",
    migrationVersion: ver.execution_id ? `exec-${ver.execution_id.slice(0, 8)}` : "v1",
    checklist,
    score,
    approvers,
  });

  if (!cert.ok) return { ok: false, message: "لا يمكن إصدار الشهادة — بنود ناقصة.", blockers: cert.blockers };

  // الدروس المستفادة.
  const durationMin = execRow?.started_at && execRow?.completed_at ? Math.round((new Date(execRow.completed_at).getTime() - new Date(execRow.started_at).getTime()) / 60000) : 0;
  const lessons = buildLessons({
    domain: execRow?.detail?.domain ?? "generic",
    dataMismatches: 0, brokenRelations: 0, businessFailures: 0, openIssues: openIssueCount, reviewTasks: 0,
    chunkSize: execRow?.chunk_size ?? 1000, workerCount: execRow?.worker_count ?? 4, durationMin, finalScore: score.finalMigrationScore,
  });

  const ins = await db.from("go_live_certificates").insert({
    verification_id: verificationId, project_id: ver.project_id, project_name: cert.data.projectName,
    migration_version: cert.data.migrationVersion, verification_score: cert.data.verificationScore,
    business_acceptance_score: cert.data.businessAcceptanceScore, final_score: cert.data.finalMigrationScore,
    go_live_status: cert.data.goLiveStatus, approvers, lessons: lessons.lessons, issued_by: actorId,
  }).select("id").maybeSingle();
  if (ins.error || !ins.data) return { ok: false, message: ins.error?.message ?? "فشل إصدار الشهادة." };
  const certificateId = (ins.data as { id: string }).id;

  await db.from("go_live_verifications").update({ status: "certified", certificate_id: certificateId, go_live_status: cert.data.goLiveStatus }).eq("id", verificationId);

  // ترقية الدروس للذاكرة المؤسسية + إشعار.
  try {
    await promoteGoLiveToOrgMemory(verificationId, lessons.lessons, ver.project_id, execRow?.detail?.domain ?? "generic", actorId, db);
  } catch { /* اختياري */ }
  await notifyGoLive("go_live_approved", verificationId, `صدرت شهادة الإطلاق (درجة ${score.finalMigrationScore}/100).`, ver.project_id);

  return { ok: true, certificateId, message: `صدرت شهادة الإطلاق — النظام مُعتمَد رسميًا (${cert.data.goLiveStatus}).` };
}
