import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { hashInput } from "@/lib/ai-platform/cache/keys";
import { isSafeForLibrary } from "./sanitize";
import { computeConfidence } from "./experience-model";

/**
 * سير الاعتماد البشري — بوّابة المكتبة العامة.
 *
 * لا معرفة تدخل مكتبة الخبرات إلا بعد قرار المدير: قبول / رفض / تعديل /
 * دمج / أرشفة. القبول بيحوّل المرشّح لخبرة معتمَدة (مُصدَّرة، مُقيَّمة
 * الثقة) — مع حاجز أمني أخير يمنع أي PII متبقٍّ.
 */

const UNDEFINED_TABLE = "42P01";

export interface CandidateRow {
  id: string;
  project_id: string | null;
  experience_type: string;
  domain: string;
  title: string;
  content: string;
  suggested_confidence: number;
  status: string;
  created_at: string;
}

export async function listPendingCandidates(
  client?: SupabaseClient
): Promise<CandidateRow[]> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("org_experience_candidates")
    .select("id, project_id, experience_type, domain, title, content, suggested_confidence, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data ?? []) as CandidateRow[];
}

/**
 * يوافق على مرشّح → يخلق خبرة معتمَدة في المكتبة.
 *
 * حاجز أمني أخير: لو النصّ فيه PII مكشوف، يُرفَض القبول — «حماية خصوصية
 * العملاء» شرط لا يُتجاوَز.
 */
export async function approveCandidate(
  candidateId: string,
  actorId: string | null,
  edits?: { title?: string; content?: string; domain?: string },
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string; experienceId?: string }> {
  const db = client ?? createServiceClient();

  const { data: cand, error } = await db
    .from("org_experience_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (error || !cand) return { ok: false, message: "المرشّح غير موجود." };
  if (cand.status !== "pending") return { ok: false, message: "المرشّح محسوم بالفعل." };

  const title = (edits?.title ?? (cand.title as string)).trim();
  const content = (edits?.content ?? (cand.content as string)).trim();
  const domain = (edits?.domain ?? (cand.domain as string)).trim() || "general";

  // الحاجز الأمني الأخير.
  if (!isSafeForLibrary(`${title} ${content}`)) {
    return { ok: false, message: "المحتوى يحتوي بيانات حسّاسة مكشوفة — نظّفه قبل الاعتماد." };
  }

  const sourceProjects = cand.project_id ? [cand.project_id as string] : [];
  const confidence = computeConfidence({
    projectCount: sourceProjects.length,
    quality: Math.min(100, content.length / 4),
    humanApproved: true,
  });

  const { data: exp, error: insErr } = await db
    .from("org_experiences")
    .insert({
      experience_type: cand.experience_type,
      domain,
      title,
      content,
      sanitized: true,
      confidence,
      quality_score: Math.min(100, Math.round(content.length / 4)),
      source_project_ids: sourceProjects,
      created_by: actorId,
      dedupe_hash: hashInput(`${cand.experience_type}::${title.toLowerCase()}`),
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // 23505 = خرق فريد → خبرة بنفس التجزئة موجودة؛ نقترح الدمج.
    if (insErr.code === "23505") {
      return { ok: false, message: "خبرة مطابقة موجودة بالفعل — استخدم الدمج بدل الاعتماد." };
    }
    if (insErr.code === UNDEFINED_TABLE) return { ok: false, message: "الجداول غير مطبَّقة بعد (0082)." };
    return { ok: false, message: insErr.message };
  }

  const experienceId = exp?.id as string;

  // إصدار أولي للتاريخ والتراجع.
  await db.from("org_experience_versions").insert({
    experience_id: experienceId,
    version: 1,
    title,
    content,
    change_reason: "اعتماد أوّلي",
    created_by: actorId,
  });

  await db
    .from("org_experience_candidates")
    .update({ status: "approved", decided_by: actorId, decided_at: new Date().toISOString() })
    .eq("id", candidateId);

  return { ok: true, experienceId };
}

export async function decideCandidate(
  candidateId: string,
  decision: "rejected" | "archived",
  actorId: string | null,
  reason?: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db
    .from("org_experience_candidates")
    .update({ status: decision, decided_by: actorId, decided_at: new Date().toISOString(), decision_reason: reason ?? null })
    .eq("id", candidateId)
    .eq("status", "pending");
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * يدمج مرشّحًا في خبرة قائمة: يضيف المشروع لمصادرها ويرفع ثقتها، بلا
 * تكرار الخبرة.
 */
export async function mergeCandidate(
  candidateId: string,
  targetExperienceId: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();

  const { data: cand } = await db.from("org_experience_candidates").select("project_id, status").eq("id", candidateId).maybeSingle();
  if (!cand || cand.status !== "pending") return { ok: false, message: "المرشّح غير صالح للدمج." };

  const { data: exp } = await db
    .from("org_experiences")
    .select("source_project_ids, confidence")
    .eq("id", targetExperienceId)
    .maybeSingle();
  if (!exp) return { ok: false, message: "الخبرة الهدف غير موجودة." };

  const sources = new Set([...((exp.source_project_ids as string[]) ?? [])]);
  if (cand.project_id) sources.add(cand.project_id as string);

  const newConfidence = computeConfidence({ projectCount: sources.size, quality: 70, humanApproved: true });

  await db
    .from("org_experiences")
    .update({ source_project_ids: [...sources], confidence: newConfidence })
    .eq("id", targetExperienceId);

  await db
    .from("org_experience_candidates")
    .update({ status: "merged", merged_into: targetExperienceId, decided_by: actorId, decided_at: new Date().toISOString() })
    .eq("id", candidateId);

  return { ok: true };
}
