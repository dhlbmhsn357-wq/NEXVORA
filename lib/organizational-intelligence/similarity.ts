import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectSimilarityMatch } from "@/lib/types/database";

export const SIMILARITY_MATCH_THRESHOLD = 0.55;
const MATCH_COUNT = 5;

/**
 * مشاريع سابقة مشابهة عبر pgvector Cosine Similarity (Cross-Project
 * Intelligence) — بيرجّع [] لو المشروع نفسه لسه ماعندوش Embedding أو
 * مفيش مشروع سابق قريب بما يكفي. مفيش أي توصية بعد كده من غير الأدلة دي.
 */
export async function findSimilarProjects(supabase: SupabaseClient, projectId: string): Promise<ProjectSimilarityMatch[]> {
  const { data: own } = await supabase.from("project_embeddings").select("embedding").eq("project_id", projectId).maybeSingle();
  if (!own?.embedding) return [];

  const { data: matches } = await supabase.rpc("match_similar_projects", {
    query_embedding: own.embedding,
    exclude_project_id: projectId,
    match_count: MATCH_COUNT,
  });
  const rows = (matches as Array<{ project_id: string; similarity: number }> | null) ?? [];
  const relevant = rows.filter((r) => r.similarity >= SIMILARITY_MATCH_THRESHOLD);
  if (relevant.length === 0) return [];

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .in("id", relevant.map((r) => r.project_id));
  const nameById = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));

  return relevant.map((r) => ({
    project_id: r.project_id,
    project_name: nameById.get(r.project_id) ?? "مشروع محذوف",
    similarity_score: Math.round(r.similarity * 100),
  }));
}
