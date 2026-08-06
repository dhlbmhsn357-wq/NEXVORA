"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { getMigrationDashboard, type MigrationDashboard } from "@/lib/migration-discovery/dashboard";
import {
  registerSource,
  updateSource,
  deleteSource,
  setSourceStatus,
  testAndRecordConnection,
  getSource,
  type SafeSourceRow,
} from "@/lib/migration-discovery/source-service";
import { runSourceAnalysis, getLatestReport, getSnapshotDetail } from "@/lib/migration-discovery/analysis-service";
import { promoteAnalysisToOrgMemory } from "@/lib/migration-discovery/knowledge-integration";
import type { ConnectionMode } from "@/lib/migration-discovery/source-types";

/**
 * إجراءات منصّة اكتشاف الترحيل.
 *
 * الحوكمة (من المواصفة):
 * - **Director/Admin**: إنشاء/تعديل/اختبار/تحليل/حذف/ترقية.
 * - **Supervisor**: قراءة فقط.
 * - **Executor**: لا يرى هذه المرحلة (RBAC على المسار + الإجراء + التنقّل).
 */

const CREATOR = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: MigrationDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getMigrationDashboard(projectId) };
}

export async function createSource(input: {
  projectId: string | null;
  name: string;
  sourceType: string;
  connectionMode: ConnectionMode;
  connectionConfig: Record<string, unknown>;
}): Promise<{ ok: boolean; message?: string; id?: string }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!input.name?.trim()) return { ok: false, message: "اسم المصدر مطلوب." };
  return registerSource(
    {
      projectId: input.projectId,
      name: input.name,
      sourceType: input.sourceType,
      connectionMode: input.connectionMode,
      connectionConfig: input.connectionConfig ?? {},
    },
    auth.userId ?? null
  );
}

export async function editSource(id: string, patch: { name?: string; connectionConfig?: Record<string, unknown> }): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return updateSource(id, patch);
}

export async function removeSource(id: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return deleteSource(id);
}

export async function disableSource(id: string, disabled: boolean): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  await setSourceStatus(id, disabled ? "disabled" : "draft");
  return { ok: true };
}

export async function testConnection(id: string, content: string): Promise<{ ok: boolean; message?: string; result?: unknown }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const r = await testAndRecordConnection(id, content ?? "");
  return { ok: r.ok, message: r.message, result: r.result };
}

/**
 * يبدأ التحليل في الخلفية (after) ويعيد فورًا — الواجهة تقرأ الحالة
 * بالـPolling عبر getSourceReport. المحتوى لا يُخزَّن (خصوصية) — يُحلَّل ثم
 * تُحفَظ البنية المشتقّة فقط.
 */
export async function startAnalysis(id: string, content: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!content?.trim()) return { ok: false, message: "أضف محتوى (ملف/Schema) للتحليل." };

  await setSourceStatus(id, "analyzing");
  const actorId = auth.userId ?? null;
  after(async () => {
    await runSourceAnalysis(id, content, actorId);
  });
  return { ok: true, message: "بدأ التحليل — سيظهر التقرير عند الاكتمال." };
}

export async function getSourceReport(id: string): Promise<{ ok: boolean; source?: SafeSourceRow | null; report?: unknown; detail?: unknown }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const source = await getSource(id);
  const report = await getLatestReport(id);
  let detail: unknown = null;
  if (report && (report as { snapshot_id?: string }).snapshot_id) {
    detail = await getSnapshotDetail((report as { snapshot_id: string }).snapshot_id);
  }
  return { ok: true, source, report, detail };
}

export async function promoteToOrgMemory(id: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...CREATOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return promoteAnalysisToOrgMemory(id, auth.userId ?? null);
}
