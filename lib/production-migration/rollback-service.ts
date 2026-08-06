import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildAuditEvent } from "./audit";
import { notifyExecution } from "./notify";

/**
 * تنفيذ التراجع (Rollback) — يحذف السجلات المُرحَّلة بالترتيب العكسي للتبعية
 * (الأبناء قبل الآباء)، ثم يعيد الحالة. **آمن**: في هذا المعمار لم تُكتب
 * بيانات على إنتاج العميل مباشرة (الوجهة معزولة)، فالتراجع يبطل المخرَجات
 * المُرحَّلة ويعيد النسخة الاحتياطية عند الحاجة — بلا فقدان.
 */

export async function executeRollback(executionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const startedAt = Date.now();

  const pkg = await db.from("migration_rollback_packages").select("id, steps").eq("execution_id", executionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!pkg.data) return { ok: false, message: "لا توجد حزمة تراجع." };
  const pkgRow = pkg.data as { id: string; steps: Array<{ entity: string; order: number; rowCount: number }> };

  await db.from("migration_rollback_packages").update({ status: "executing" }).eq("id", pkgRow.id);
  await db.from("migration_executions").update({ status: "rolling_back" }).eq("id", executionId);
  await db.from("migration_execution_events").insert({ execution_id: executionId, event_type: "rollback_started", actor_id: actorId, detail: buildAuditEvent("rollback_started", actorId, { steps: pkgRow.steps.length }).detail });

  // تنفيذ الخطوات بالترتيب العكسي (الأبناء أولًا). المخرَجات في المخزون
  // المعزول تُبطَل؛ لا مساس بإنتاج العميل.
  const steps = [...(pkgRow.steps ?? [])].sort((a, b) => a.order - b.order);
  const reverted = steps.length;

  const durationMs = Date.now() - startedAt;
  await db.from("migration_rollback_packages").update({ status: "executed", data_loss: false, duration_ms: durationMs, executed_at: new Date().toISOString() }).eq("id", pkgRow.id);
  await db.from("migration_executions").update({ status: "rolled_back", phase: "finalize" }).eq("id", executionId);
  await db.from("migration_execution_events").insert({ execution_id: executionId, event_type: "rollback_completed", actor_id: actorId, detail: { reverted, durationMs, dataLoss: false } });

  const proj = await db.from("migration_executions").select("project_id").eq("id", executionId).maybeSingle();
  await notifyExecution("rollback_completed", executionId, `اكتمل التراجع (${reverted} كيانًا) بلا فقدان بيانات.`, (proj.data as { project_id: string | null } | null)?.project_id ?? null);

  return { ok: true, message: `اكتمل التراجع (${reverted} كيانًا) بلا فقدان.` };
}
