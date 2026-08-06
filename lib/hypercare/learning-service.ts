import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * خدمة التعلّم المستمر — اقتراحات المعرفة **لا تُضاف للذاكرة المؤسسية إلا
 * بعد اعتماد المدير**. الاعتماد يُنشئ مرشّح خبرة (حاجز مراجعة إضافي في
 * الذاكرة المؤسسية) — فيصبح للمعرفة الجديدة بوّابتا اعتماد.
 */

const TYPE_MAP: Record<string, string> = {
  lesson: "lesson_learned",
  pattern: "success_pattern",
  business_rule: "reusable_business_rule",
};

export async function approveKnowledge(suggestionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const s = await db.from("hypercare_knowledge_suggestions").select("period_id, project_id, kind, title, content, confidence, status").eq("id", suggestionId).maybeSingle();
  const row = s.data as { period_id: string; project_id: string | null; kind: string; title: string; content: string; confidence: number; status: string } | null;
  if (!row) return { ok: false, message: "الاقتراح غير موجود." };
  if (row.status !== "pending") return { ok: false, message: "سبق البتّ في هذا الاقتراح." };

  let candidateId: string | null = null;
  try {
    const ins = await db.from("org_experience_candidates").insert({
      project_id: row.project_id, experience_type: TYPE_MAP[row.kind] ?? "lesson_learned", domain: "general",
      title: row.title, content: row.content, detail: { source: "hypercare", kind: row.kind },
      sanitized: true, suggested_confidence: row.confidence, status: "pending",
    }).select("id").maybeSingle();
    if (ins.error) return { ok: false, message: ins.error.message };
    candidateId = (ins.data as { id: string } | null)?.id ?? null;
  } catch {
    return { ok: false, message: "تعذّر الحفظ (جدول الذاكرة المؤسسية غير متاح)." };
  }

  await db.from("hypercare_knowledge_suggestions").update({ status: "approved", promoted_candidate_id: candidateId, decided_by: actorId, decided_at: new Date().toISOString() }).eq("id", suggestionId);
  // زِد عدّاد المعرفة المضافة.
  const { data } = await db.from("hypercare_knowledge_suggestions").select("id").eq("period_id", row.period_id).eq("status", "approved");
  await db.from("hypercare_periods").update({ knowledge_added: ((data ?? []) as unknown[]).length }).eq("id", row.period_id);
  return { ok: true, message: "اعتُمد الاقتراح ورُقّي كمرشّح خبرة (بانتظار مراجعة الذاكرة المؤسسية)." };
}

export async function rejectKnowledge(suggestionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("hypercare_knowledge_suggestions").update({ status: "rejected", decided_by: actorId, decided_at: new Date().toISOString() }).eq("id", suggestionId).eq("status", "pending");
  if (upd.error) return { ok: false, message: upd.error.message };
  return { ok: true, message: "رُفض الاقتراح." };
}

/** ملاحظات المستخدمين (Problem/Suggestion/Bug/Improvement/Question). */
export async function submitFeedback(periodId: string, kind: "problem" | "suggestion" | "bug" | "improvement" | "question", title: string, detail: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  if (!title.trim()) return { ok: false, message: "عنوان الملاحظة مطلوب." };
  const proj = await db.from("hypercare_periods").select("project_id").eq("id", periodId).maybeSingle();
  const ins = await db.from("hypercare_feedback").insert({ period_id: periodId, project_id: (proj.data as { project_id: string | null } | null)?.project_id ?? null, kind, title: title.trim(), detail, status: "open", submitted_by: actorId });
  if (ins.error) return { ok: false, message: ins.error.message };
  return { ok: true, message: "سُجِّلت الملاحظة ورُبطت بالمشروع." };
}
