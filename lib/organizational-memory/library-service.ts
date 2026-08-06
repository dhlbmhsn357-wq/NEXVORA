import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { usageAdjustment } from "./experience-model";

/**
 * مكتبة الخبرات المؤسسية — القراءة والبحث والاستخدام والتحسين المستمر.
 */

const UNDEFINED_TABLE = "42P01";

export interface Experience {
  id: string;
  experience_type: string;
  domain: string;
  title: string;
  content: string;
  confidence: number;
  usage_count: number;
  impact_score: number;
  quality_score: number;
  status: string;
  source_project_ids: string[];
  version: number;
}

export async function listExperiences(
  opts: { domain?: string; type?: string; search?: string } = {},
  client?: SupabaseClient
): Promise<Experience[]> {
  const db = client ?? createServiceClient();
  let query = db.from("org_experiences").select("*").eq("status", "published").order("usage_count", { ascending: false });
  if (opts.domain) query = query.eq("domain", opts.domain);
  if (opts.type) query = query.eq("experience_type", opts.type);

  const { data, error } = await query.limit(500);
  if (error) {
    if (error.code !== UNDEFINED_TABLE) console.error(`[OrgMemory] تعذّر قراءة الخبرات: ${error.message}`);
    return [];
  }

  let rows = (data ?? []) as Experience[];

  // بحث نصّي بسيط في الذاكرة (البحث الدلالي إضافة لاحقة فوق نفس البنية).
  if (opts.search?.trim()) {
    const q = normalize(opts.search);
    rows = rows.filter((e) => normalize(`${e.title} ${e.content}`).includes(q));
  }

  return rows;
}

/**
 * يسجّل استخدام خبرة في مشروع: يرفع العدّاد والثقة (تحسين مستمر)،
 * ويقترح التقاعد لو ثبت ضعفها.
 */
export async function recordUsage(
  experienceId: string,
  client?: SupabaseClient
): Promise<{ suggestRetire: boolean }> {
  const db = client ?? createServiceClient();
  const { data } = await db.from("org_experiences").select("usage_count, confidence").eq("id", experienceId).maybeSingle();
  const usage = ((data?.usage_count as number) ?? 0) + 1;
  const confidence = (data?.confidence as number) ?? 50;

  const adj = usageAdjustment(usage, confidence);
  await db
    .from("org_experiences")
    .update({ usage_count: usage, confidence: adj.nextConfidence })
    .eq("id", experienceId);

  return { suggestRetire: adj.suggestRetire };
}

export async function retireExperience(
  experienceId: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from("org_experiences").update({ status: "retired" }).eq("id", experienceId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ============================================================
// الإصدارات والتراجع
// ============================================================

export async function listExperienceVersions(
  experienceId: string,
  client?: SupabaseClient
): Promise<Array<{ version: number; title: string; content: string; change_reason: string; created_at: string }>> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("org_experience_versions")
    .select("version, title, content, change_reason, created_at")
    .eq("experience_id", experienceId)
    .order("version", { ascending: false });
  if (error) return [];
  return (data ?? []) as Array<{ version: number; title: string; content: string; change_reason: string; created_at: string }>;
}

/**
 * يعدّل خبرة بإصدار جديد (لا استبدال صامت — التاريخ محفوظ).
 */
export async function reviseExperience(
  experienceId: string,
  edits: { title: string; content: string },
  changeReason: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string; version?: number }> {
  const db = client ?? createServiceClient();
  const { data: exp } = await db.from("org_experiences").select("version").eq("id", experienceId).maybeSingle();
  if (!exp) return { ok: false, message: "الخبرة غير موجودة." };

  const nextVersion = ((exp.version as number) ?? 1) + 1;

  await db.from("org_experiences").update({ title: edits.title, content: edits.content, version: nextVersion }).eq("id", experienceId);
  await db.from("org_experience_versions").insert({
    experience_id: experienceId,
    version: nextVersion,
    title: edits.title,
    content: edits.content,
    change_reason: changeReason,
    created_by: actorId,
  });

  return { ok: true, version: nextVersion };
}

/**
 * يتراجع لإصدار سابق: يكتب الإصدار القديم كإصدار جديد (لا يمسح التاريخ).
 */
export async function rollbackExperience(
  experienceId: string,
  targetVersion: number,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { data: target } = await db
    .from("org_experience_versions")
    .select("title, content")
    .eq("experience_id", experienceId)
    .eq("version", targetVersion)
    .maybeSingle();
  if (!target) return { ok: false, message: "الإصدار الهدف غير موجود." };

  return reviseExperience(
    experienceId,
    { title: target.title as string, content: target.content as string },
    `تراجع للإصدار ${targetVersion}`,
    actorId,
    db
  ).then((r) => ({ ok: r.ok, message: r.message }));
}

function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}
