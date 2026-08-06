import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import { AIService } from "@/lib/ai/service";

const MAX_SOURCE_CHARS = 6000;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...تم اختصار الباقي...]` : text;
}

/**
 * التمثيل الدلالي الموحّد لأي مشروع — من Project Brain (المصدر الأغنى
 * والأكثر استقرارًا لكل مشروع). يُستدعى في نقطتين: (أ) عند اعتماد Brain
 * لأول مرة (عشان Cross-Project Similarity تشتغل من بداية المشروع)،
 * و(ب) عند أرشفة المشروع (تحديث أخير قبل استخراج المعرفة). نفس المنطق
 * بالظبط في الحالتين — دالة واحدة مشتركة بدل تكرارها.
 */
export async function upsertProjectEmbeddingFromBrain(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ ok: boolean; embedding: number[] | null }> {
  const brain = await getBrainForDownstreamGeneration(supabase, projectId);
  if (!brain) return { ok: false, embedding: null };

  const summary = truncate(formatBrainV2ForPrompt(brain.content), MAX_SOURCE_CHARS);
  const result = await AIService.embed(summary, { projectId });
  if (!result.success || !result.embedding) return { ok: false, embedding: null };

  await supabase.from("project_embeddings").upsert({
    project_id: projectId,
    embedding: result.embedding,
    source_summary: summary.slice(0, 500),
    generated_at: new Date().toISOString(),
  });

  return { ok: true, embedding: result.embedding };
}
