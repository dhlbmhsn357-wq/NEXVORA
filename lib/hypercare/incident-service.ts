import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { extractLesson } from "./learning-engine";
import { analyzeHypercareWithAi } from "./ai-hypercare-service";
import { computeHealth } from "./health-score";

/**
 * مركز الحوادث — إنشاء يدوي، حلّ (مع جذر السبب)، وتحليل جذر السبب بالذكاء
 * الاصطناعي (على الطلب). حلّ الحادثة يُنشئ **اقتراح معرفة** (لا يُضاف مباشرة
 * — يراجعه المدير).
 */

export async function createIncident(periodId: string, title: string, severity: "critical" | "high" | "medium" | "low", impact: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  if (!title.trim()) return { ok: false, message: "عنوان الحادثة مطلوب." };
  const ins = await db.from("hypercare_incidents").insert({ period_id: periodId, title: title.trim(), severity, status: "open", impact, detected_by: "manual", reported_by: actorId });
  if (ins.error) return { ok: false, message: ins.error.message };
  await recountIncidents(db, periodId);
  return { ok: true, message: "سُجِّلت الحادثة." };
}

export async function resolveIncident(incidentId: string, rootCause: string, resolution: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const inc = await db.from("hypercare_incidents").select("period_id, title, severity, affected_modules").eq("id", incidentId).maybeSingle();
  const row = inc.data as { period_id: string; title: string; severity: string; affected_modules: string[] } | null;
  if (!row) return { ok: false, message: "الحادثة غير موجودة." };

  const upd = await db.from("hypercare_incidents").update({ status: "resolved", root_cause: rootCause, resolution, resolved_by: actorId, resolved_at: new Date().toISOString() }).eq("id", incidentId);
  if (upd.error) return { ok: false, message: upd.error.message };

  // درس مستفاد → اقتراح معرفة (حاجز مراجعة المدير).
  const lesson = extractLesson({ title: row.title, severity: row.severity, rootCause, resolution, affectedModules: row.affected_modules ?? [] });
  const proj = await db.from("hypercare_periods").select("project_id").eq("id", row.period_id).maybeSingle();
  await db.from("hypercare_knowledge_suggestions").insert({
    period_id: row.period_id, project_id: (proj.data as { project_id: string | null } | null)?.project_id ?? null,
    kind: lesson.kind, title: lesson.title, content: lesson.content, confidence: lesson.confidence, source_incident_id: incidentId, status: "pending",
  });

  await recountIncidents(db, row.period_id);
  return { ok: true, message: "حُلّت الحادثة وأُنشئ اقتراح معرفة للمراجعة." };
}

/** تحليل جذر السبب بالذكاء الاصطناعي (على الطلب) — يحدّث root_cause. */
export async function suggestRootCause(incidentId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; rootCause?: string; message?: string }> {
  const db = client ?? createServiceClient();
  const inc = await db.from("hypercare_incidents").select("period_id, title, severity").eq("id", incidentId).maybeSingle();
  const row = inc.data as { period_id: string; title: string; severity: string } | null;
  if (!row) return { ok: false, message: "الحادثة غير موجودة." };

  const health = computeHealth({ databaseOk: true, apiOk: true, storageOk: true, queuesOk: true, workersActive: true, cacheOk: true, avgQueryMs: 200, errorRatePercent: 1, businessStable: true });
  const ai = await analyzeHypercareWithAi({ health, anomalies: [], openIncidents: [row.title] }, "generic", actorId);
  const rc = ai?.root_cause_analysis?.[0]?.root_cause ?? "";
  if (rc) await db.from("hypercare_incidents").update({ root_cause: rc, detected_by: "ai" }).eq("id", incidentId);
  return { ok: true, rootCause: rc || undefined, message: rc ? "اقتُرح جذر السبب." : "تعذّر توليد جذر السبب — تحليل يدوي." };
}

async function recountIncidents(db: SupabaseClient, periodId: string): Promise<void> {
  const { data } = await db.from("hypercare_incidents").select("status").eq("period_id", periodId);
  const rows = (data ?? []) as Array<{ status: string }>;
  await db.from("hypercare_periods").update({ total_incidents: rows.length, resolved_incidents: rows.filter((r) => r.status === "resolved" || r.status === "closed").length }).eq("id", periodId);
}
