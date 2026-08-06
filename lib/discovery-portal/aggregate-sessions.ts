import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySnapshotItem } from "@/lib/types/database";
import { buildDiscoveryPairs, type DiscoveryPair } from "@/lib/discovery-templates/snapshot";

/** استجابة جلسة واحدة كما تُقرأ من قاعدة البيانات (مع ميتاداتا الجلسة من الرابط). */
export interface SessionFormRow {
  id: string;
  link_id: string | null;
  answers: Record<string, unknown>;
  questions_snapshot: DiscoverySnapshotItem[] | null;
  session_name: string | null;
  department: string | null;
}

export interface AggregatedDiscovery {
  /** اتحاد كل الإجابات عبر الجلسات — مفاتيح الأسئلة فريدة عالميًا (uuid) فمفيش تصادم. */
  mergedAnswers: Record<string, unknown>;
  /** اتحاد كل الـ snapshots — لتفسير evidence.question_id لأي جلسة. */
  mergedSnapshot: DiscoverySnapshotItem[];
  /** أزواج (label:value) من كل الجلسات، كل زوج مسبوق بمصدره [الإدارة/الجلسة]. */
  labeledPairs: DiscoveryPair[];
  /** عدد الجلسات اللي فيها إجابات فعلية. */
  answeredSessions: number;
  hasData: boolean;
}

function hasAnyAnswer(answers: Record<string, unknown>): boolean {
  return Object.values(answers).some((v) => {
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

/**
 * يقرأ كل جلسات الاكتشاف (الاستجابات) لمشروع ويجمّعها في معرفة واحدة —
 * ده جوهر الـ Workspace: الـ AI (تحليل/Brain/توصيات/...) بيفكّر فوق كل
 * الجلسات مجمّعة، مش الأخيرة بس. لكل زوج مصدره (الإدارة/اسم الجلسة)
 * محفوظ في الـ label عشان الـ AI يعرف السياق.
 */
export async function getProjectSessionForms(
  supabase: SupabaseClient,
  projectId: string
): Promise<SessionFormRow[]> {
  const { data } = await supabase
    .from("discovery_forms")
    .select("id, link_id, answers, questions_snapshot, discovery_form_links(session_name, department)")
    .eq("project_id", projectId);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const linkRel = row.discovery_form_links as { session_name: string | null; department: string | null } | Array<{ session_name: string | null; department: string | null }> | null;
    const link = Array.isArray(linkRel) ? linkRel[0] ?? null : linkRel;
    return {
      id: row.id as string,
      link_id: (row.link_id as string | null) ?? null,
      answers: (row.answers ?? {}) as Record<string, unknown>,
      questions_snapshot: (row.questions_snapshot ?? null) as DiscoverySnapshotItem[] | null,
      session_name: link?.session_name ?? null,
      department: link?.department ?? null,
    };
  });
}

/** يبني المعرفة المجمّعة من صفوف الجلسات (Pure — قابلة للاختبار). */
export function aggregateSessionForms(forms: SessionFormRow[]): AggregatedDiscovery {
  const mergedAnswers: Record<string, unknown> = {};
  const mergedSnapshot: DiscoverySnapshotItem[] = [];
  const labeledPairs: DiscoveryPair[] = [];
  let answeredSessions = 0;

  for (const form of forms) {
    if (!hasAnyAnswer(form.answers)) continue;
    answeredSessions++;

    Object.assign(mergedAnswers, form.answers);
    if (form.questions_snapshot) mergedSnapshot.push(...form.questions_snapshot);

    const source = (form.department || form.session_name || "").trim();
    const prefix = source ? `[${source}] ` : "";
    const pairs = buildDiscoveryPairs(form.answers, form.questions_snapshot ?? null);
    for (const p of pairs) {
      labeledPairs.push({ ...p, label: `${prefix}${p.label}` });
    }
  }

  return {
    mergedAnswers,
    mergedSnapshot,
    labeledPairs,
    answeredSessions,
    hasData: answeredSessions > 0,
  };
}

/** اختصار: يقرأ ويجمّع في خطوة واحدة. */
export async function getAggregatedDiscovery(
  supabase: SupabaseClient,
  projectId: string
): Promise<AggregatedDiscovery> {
  const forms = await getProjectSessionForms(supabase, projectId);
  return aggregateSessionForms(forms);
}
