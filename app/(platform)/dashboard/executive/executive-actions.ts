"use server";

import { requireRole } from "@/lib/auth/rbac";
import {
  askExecutiveAssistant,
  generateExecutiveReport,
  computeAndStoreSnapshot,
  refreshExecutiveAlerts,
} from "@/lib/executive/service";
import type { ExecutiveReport, ExecutiveReportPeriod } from "@/lib/types/database";

/** غرفة القيادة حصريًا لـ owner/admin. */
async function gate() {
  return requireRole(["owner", "admin"]);
}

export async function askExecutiveAssistantAction(question: string): Promise<{ ok: boolean; answer?: string; message?: string }> {
  const auth = await gate();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!question.trim()) return { ok: false, message: "اكتب سؤالك أولًا." };
  return askExecutiveAssistant(question.trim(), auth.userId ?? null);
}

export async function generateExecutiveReportAction(period: ExecutiveReportPeriod): Promise<{ ok: boolean; report?: ExecutiveReport; message?: string }> {
  const auth = await gate();
  if (!auth.ok) return { ok: false, message: auth.message };
  return generateExecutiveReport(period, auth.userId ?? null);
}

/** إعادة حساب لقطة الصحة + التنبيهات التنفيذية يدويًا. */
export async function refreshExecutiveSnapshotAction(): Promise<{ ok: boolean; message?: string }> {
  const auth = await gate();
  if (!auth.ok) return { ok: false, message: auth.message };
  const snapshot = await computeAndStoreSnapshot();
  await refreshExecutiveAlerts(snapshot);
  return { ok: true };
}
