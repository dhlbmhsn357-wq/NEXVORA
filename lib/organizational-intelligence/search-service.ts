import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";

const SEARCH_MATCH_THRESHOLD = 0.35;
const SEARCH_MATCH_COUNT = 20;

export interface KnowledgeSearchResult {
  id: string;
  category: string;
  title: string;
  content: string;
  confidence_score: number;
  occurrence_count: number;
  status: string;
  similarity: number;
}

/**
 * البحث الدلالي (Semantic Search) في الـ Knowledge Base — Embedding
 * حقيقي للاستعلام + pgvector Cosine Search، مش مطابقة كلمات.
 */
export async function searchOrganizationalKnowledge(query: string): Promise<{ ok: true; results: KnowledgeSearchResult[] } | { ok: false; message: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, results: [] };

  const embeddingResult = await AIService.embed(trimmed);
  if (!embeddingResult.success || !embeddingResult.embedding) {
    return { ok: false, message: embeddingResult.error?.message ?? "فشل توليد Embedding للاستعلام." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("match_organizational_knowledge", {
    query_embedding: embeddingResult.embedding,
    match_threshold: SEARCH_MATCH_THRESHOLD,
    match_count: SEARCH_MATCH_COUNT,
  });
  if (error) return { ok: false, message: error.message };

  return { ok: true, results: (data as KnowledgeSearchResult[] | null) ?? [] };
}
