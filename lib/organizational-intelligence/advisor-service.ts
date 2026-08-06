import { createServiceClient } from "@/lib/supabase/service";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildProductAdvisorPrompt } from "@/lib/ai/prompts/organizational-intelligence";
import { validateProductAdvisor, type ProductAdvisorResult } from "@/lib/ai/validation/organizational-intelligence";
import { getRelevantPastDecisions } from "./decision-memory-service";
import type { ProductAdvisorAnalysis } from "@/lib/types/database";

const MAX_CONTENT_CHARS = 6000;
const KNOWLEDGE_SAMPLE_SIZE = 8;
const DECISION_SAMPLE_SIZE = 8;
const STALE_LOCK_MS = 6 * 60_000;
/**
 * ميزانية انتظار الـ Rate Limit — نفس قيمة كل محرك تاني في المشروع،
 * تحت سقف maxDuration=260s بهامش أمان (الجزء الوحيد اللي فضل متزامن من
 * التصميم القديم؛ بقى جوّه Background Job دلوقتي فمفيش داعي حقيقي
 * لتقليله، لكن سيبناه زي ما هو لعدم كسر الافتراض الموثّق في كل مكان
 * تاني).
 */
const ADVISOR_RATE_LIMIT_BUDGET_MS = 170_000;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...تم اختصار الباقي...]` : text;
}

async function releaseAsFailed(supabase: ReturnType<typeof createServiceClient>, projectId: string, message: string) {
  await supabase
    .from("product_advisor_analyses")
    .update({ status: "failed", last_error: message, completed_at: new Date().toISOString() })
    .eq("project_id", projectId);
}

/**
 * AI Product Advisor — تحليل استشاري للقراءة فقط، Background Job قابل
 * للـ Polling ومُخزَّن (صف واحد بيتحدّث لكل مشروع، مش تاريخ نسخ — تحليل
 * "حالة حالية" مش سجل قرارات). كان قبل كده نداء متزامن بدون أي تخزين
 * ("Preview" بحت) فنتيجته كانت بتضيع فور تغيير التبويب أو الـ Refresh —
 * اتحوّل لنفس نمط PRD/Presentation/Handoff (claim → background job →
 * Polling) عشان يفضل موجود.
 */
export class AIProductAdvisor {
  static async startAnalysis(
    projectId: string
  ): Promise<{ status: "started" } | { status: "already_generating" } | { status: "error"; message: string }> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("product_advisor_analyses")
      .select("id, status, started_at")
      .eq("project_id", projectId)
      .maybeSingle();

    if (existing) {
      const row = existing as { id: string; status: string; started_at: string | null };
      const isStale = row.status === "generating" && row.started_at && Date.now() - new Date(row.started_at).getTime() > STALE_LOCK_MS;
      if (row.status === "generating" && !isStale) return { status: "already_generating" };

      const { error } = await supabase
        .from("product_advisor_analyses")
        .update({ status: "generating", last_error: null, started_at: new Date().toISOString(), completed_at: null })
        .eq("id", row.id);
      if (error) return { status: "error", message: error.message };
      return { status: "started" };
    }

    const { error } = await supabase
      .from("product_advisor_analyses")
      .insert({ project_id: projectId, status: "generating", started_at: new Date().toISOString() });
    if (error) return { status: "error", message: error.message };
    return { status: "started" };
  }

  static async runAnalysisCore(projectId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain) {
        await releaseAsFailed(supabase, projectId, "لا يوجد Project Brain لتحليله بعد.");
        return;
      }

      const contentSummary = truncate(formatBrainV2ForPrompt(brain.content), MAX_CONTENT_CHARS);

      // تصفية حسب مجال المشروع (لو محدّد) — مشروع ERP ما يشوفش أنماط Hospital وبالعكس.
      const { data: projectRow } = await supabase.from("projects").select("domain").eq("id", projectId).maybeSingle();
      const projectDomain = (projectRow?.domain as string | null) ?? null;

      let knowledgeQuery = supabase
        .from("organizational_knowledge")
        .select("category, title, content")
        .in("status", ["validated", "approved"])
        .order("learned_weight", { ascending: false })
        .limit(KNOWLEDGE_SAMPLE_SIZE);
      if (projectDomain) knowledgeQuery = knowledgeQuery.or(`domain.eq.${projectDomain},domain.is.null`);
      const { data: knowledgeRows } = await knowledgeQuery;
      const relevantKnowledge = (knowledgeRows ?? []).map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n");

      const pastDecisions = await getRelevantPastDecisions(supabase, projectId, DECISION_SAMPLE_SIZE);
      const relevantDecisions = pastDecisions
        .map((d) => `- "${d.decision_title}" (${d.outcome === "succeeded" ? "نجح" : d.outcome === "failed" ? "فشل" : "غير معروف"})${d.rationale ? `: ${d.rationale}` : ""}`)
        .join("\n");

      const prompt = buildProductAdvisorPrompt("Project Brain", contentSummary, relevantKnowledge, relevantDecisions);
      const aiResponse = await executeAIWithRateLimitWait(
        AITaskType.AI_PRODUCT_ADVISOR,
        prompt,
        { projectId },
        ADVISOR_RATE_LIMIT_BUDGET_MS
      );
      if (!aiResponse.success) {
        const friendly =
          aiResponse.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", aiResponse.error?.message ?? "")
            : aiResponse.error?.message ?? "فشل استدعاء AI.";
        await releaseAsFailed(supabase, projectId, friendly);
        return;
      }

      const validated = validateProductAdvisor(aiResponse.output);
      if (!validated.ok) {
        await releaseAsFailed(supabase, projectId, validated.reason);
        return;
      }

      await supabase
        .from("product_advisor_analyses")
        .update({
          status: "ready",
          result: validated.data,
          last_error: null,
          generated_from_brain_version: brain.version,
          completed_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);
    } catch (err) {
      await releaseAsFailed(supabase, projectId, err instanceof Error ? err.message : "خطأ غير متوقع أثناء التحليل.");
    }
  }

  static async getState(projectId: string): Promise<{ analysis: ProductAdvisorAnalysis | null }> {
    const supabase = createServiceClient();
    const { data } = await supabase.from("product_advisor_analyses").select("*").eq("project_id", projectId).maybeSingle();
    return { analysis: (data as ProductAdvisorAnalysis | null) ?? null };
  }
}

export type { ProductAdvisorResult };
