"use server";

import { requireRole } from "@/lib/auth/rbac";
import { listWorkflowExecutions, analyzeAutomation, type ExecutionRow, type AutomationIntelligenceResult } from "@/lib/automation/service";

/** إعادة تحميل سجل التنفيذ (للتحديث الحي بعد إشعار Realtime). */
export async function refreshExecutionsAction(): Promise<{ ok: boolean; rows?: ExecutionRow[]; message?: string }> {
  const auth = await requireRole(["supervisor", "admin", "owner"]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, rows: await listWorkflowExecutions(100) };
}

/** تحليل أداء الأتمتة عبر AI (اختناقات + إخفاقات متكررة + توصيات). */
export async function analyzeAutomationAction(): Promise<{ ok: boolean; result?: AutomationIntelligenceResult; message?: string }> {
  const auth = await requireRole(["supervisor", "admin", "owner"]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return analyzeAutomation(auth.userId);
}
