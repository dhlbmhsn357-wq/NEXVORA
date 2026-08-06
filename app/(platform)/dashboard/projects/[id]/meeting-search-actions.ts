"use server";

import { createClient } from "@/lib/supabase/server";
import type { MeetingKnowledgeSearchResult } from "@/lib/types/database";

/** بحث موحّد عبر كل معرفة الاجتماعات المُطبّعة (قرارات/متطلبات/مخاطر/أسئلة/مهام/عناصر/مرفقات) — search_meeting_knowledge() من Migration 0050. */
export async function searchMeetingKnowledgeAction(
  projectId: string,
  query: string
): Promise<{ ok: true; results: MeetingKnowledgeSearchResult[] } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, results: [] };

  const { data, error } = await supabase.rpc("search_meeting_knowledge", { p_project_id: projectId, p_query: trimmed });
  if (error) return { ok: false, message: error.message };

  return { ok: true, results: (data as MeetingKnowledgeSearchResult[] | null) ?? [] };
}
