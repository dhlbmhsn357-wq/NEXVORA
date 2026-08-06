import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * تكامل الذاكرة المؤسسية — بعد اكتمال ترحيل حقيقي، يحفظ الخبرات التشغيلية
 * (أفضل Batch Size، عدد العمّال، المدّة، الأخطاء وحلولها) كمرشّحات خبرة
 * (حاجز مراجعة المدير) لتحسين ترحيلات المستقبل. **مشتقّات معقّمة فقط.**
 */

export async function promoteExecutionToOrgMemory(executionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; count?: number }> {
  const db = client ?? createServiceClient();
  const exec = await db.from("migration_executions").select("project_id, chunk_size, worker_count, total_rows, migrated_rows, failed_rows, completed_tasks, failed_tasks, started_at, completed_at, status, detail").eq("id", executionId).maybeSingle();
  if (!exec.data) return { ok: false, message: "العملية غير موجودة." };
  const e = exec.data as { project_id: string | null; chunk_size: number; worker_count: number; total_rows: number; migrated_rows: number; failed_rows: number; completed_tasks: number; failed_tasks: number; started_at: string | null; completed_at: string | null; status: string; detail: { domain?: string } };
  if (e.status !== "completed") return { ok: false, message: "لا تُرقّى إلا عمليات مكتملة." };

  const durationMin = e.started_at && e.completed_at ? Math.round((new Date(e.completed_at).getTime() - new Date(e.started_at).getTime()) / 60000) : 0;
  const domain = e.detail?.domain ?? "general";

  const candidates: Array<{ experience_type: string; title: string; content: string }> = [
    { experience_type: "best_practice", title: `إعدادات ترحيل مثلى — ${domain}`, content: `Batch Size ${e.chunk_size}، عمّال ${e.worker_count}. رُحّل ${e.migrated_rows}/${e.total_rows} صفًّا في ${durationMin} دقيقة، ${e.failed_rows} فشل.` },
  ];
  if (e.failed_tasks > 0) candidates.push({ experience_type: "lesson_learned", title: `دفعات محتاجة مراجعة — ${domain}`, content: `${e.failed_tasks} دفعة دخلت طابور المراجعة أثناء الترحيل الحقيقي — راجع أنماط الأخطاء لتحسين المرّة القادمة.` });

  const rows = candidates.map((c) => ({
    project_id: e.project_id, experience_type: c.experience_type, domain, title: c.title, content: c.content,
    detail: { source: "migration_execution", chunk_size: e.chunk_size, worker_count: e.worker_count, duration_min: durationMin },
    sanitized: true, suggested_confidence: Math.max(50, Math.min(90, 100 - e.failed_tasks * 5)), status: "pending",
  }));

  try {
    const ins = await db.from("org_experience_candidates").insert(rows);
    if (ins.error) return { ok: false, message: ins.error.message };
  } catch {
    return { ok: false, message: "تعذّر حفظ المرشّحات (جدول الذاكرة المؤسسية غير متاح)." };
  }
  await db.from("migration_executions").update({ promoted_to_org_memory: true }).eq("id", executionId);
  void actorId;
  return { ok: true, count: candidates.length, message: `رُقّيت ${candidates.length} خبرة تشغيلية (بانتظار مراجعة المدير).` };
}
