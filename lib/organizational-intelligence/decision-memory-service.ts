import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { DecisionMemoryEntry } from "@/lib/types/database";

export async function getDecisionMemory(projectId: string): Promise<DecisionMemoryEntry[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("decision_memory")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data as DecisionMemoryEntry[] | null) ?? [];
}

/**
 * قرارات من مشاريع تانية اتأرشفت واستُخرج منها Decision Memory —
 * الاستخدام الوحيد الحالي لذاكرة القرارات كان قراءة المشروع لسجله هو
 * بس (write-only فعليًا من منظور أي مشروع تاني). الدالة دي بتخلّي
 * "المشاريع القادمة تستفيد فعلاً" حقيقة لا مجرد وعد في نص الواجهة —
 * بتتغذّى بيها AI Product Advisor لمشاريع جديدة.
 */
export async function getRelevantPastDecisions(
  supabase: SupabaseClient,
  excludeProjectId: string,
  limit: number
): Promise<DecisionMemoryEntry[]> {
  const { data } = await supabase
    .from("decision_memory")
    .select("*")
    .neq("project_id", excludeProjectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as DecisionMemoryEntry[] | null) ?? [];
}
