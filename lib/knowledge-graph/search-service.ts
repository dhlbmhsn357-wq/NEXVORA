import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import type { ProjectKnowledgeSearchResult } from "@/lib/types/database";

const SEARCH_MATCH_THRESHOLD = 0.35;
const SEARCH_MATCH_COUNT = 20;

/**
 * بحث دلالي داخل عناصر معرفة مشروع واحد — نفس نمط
 * lib/organizational-intelligence/search-service.ts بالظبط (Embedding
 * حقيقي للاستعلام + pgvector Cosine)، بس مقصور على مشروع واحد بدل
 * قاعدة المعرفة العابرة للمشاريع.
 */
export async function searchProjectKnowledge(
  projectId: string,
  query: string
): Promise<{ ok: true; results: ProjectKnowledgeSearchResult[] } | { ok: false; message: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, results: [] };

  const embeddingResult = await AIService.embed(trimmed);
  if (!embeddingResult.success || !embeddingResult.embedding) {
    return { ok: false, message: embeddingResult.error?.message ?? "فشل توليد Embedding للاستعلام." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("match_project_knowledge", {
    p_project_id: projectId,
    query_embedding: embeddingResult.embedding,
    match_threshold: SEARCH_MATCH_THRESHOLD,
    match_count: SEARCH_MATCH_COUNT,
  });
  if (error) return { ok: false, message: error.message };

  return { ok: true, results: (data as ProjectKnowledgeSearchResult[] | null) ?? [] };
}
