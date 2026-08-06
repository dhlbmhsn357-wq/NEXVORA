import type { SupabaseClient } from "@supabase/supabase-js";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildDiscoveryAnalysisPrompt } from "./prompt";
import { validateDiscoveryAnalysis } from "./validation";
import { backfillEvidenceLabels } from "./repair";
import { getAggregatedDiscovery } from "@/lib/discovery-portal/aggregate-sessions";
import type {
  ProjectType,
} from "@/lib/types/database";
import type { DiscoveryAnalysisOutput } from "./types";

export interface DiscoveryAnalysisRunMetadata {
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  latency_ms: number;
  retry_count: number;
  discovery_version_hash: string | null;
  discovery_form_id: string | null;
}

export type DiscoveryAnalysisRunResult =
  | { status: "success"; data: DiscoveryAnalysisOutput; metadata: DiscoveryAnalysisRunMetadata }
  | { status: "insufficient_data"; message: string }
  | { status: "error"; message: string; code: string; metadata: Partial<DiscoveryAnalysisRunMetadata> };

/**
 * Hash قصير من إجابات الاكتشاف — يستخدم لتتبّع أي إصدار اتحلّل، مش تشفير.
 */
function computeVersionHash(answers: Record<string, unknown>): string {
  const json = JSON.stringify(answers, Object.keys(answers).sort());
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = (h << 5) - h + json.charCodeAt(i);
    h |= 0;
  }
  return `v${Math.abs(h).toString(16)}`;
}

/**
 * DiscoveryAnalysisAgent — يجمع كل بيانات المشروع من المصادر الموجودة،
 * يبني الـ prompt الصارم، يستدعي AIService (retry داخلي)، يتحقق من الرد،
 * ويرجّع نتيجة مصنّفة مع كل بيانات observability.
 *
 * لا يحفظ في قاعدة البيانات — الـ runner (job) هو المسؤول عن الحفظ.
 */
export class DiscoveryAnalysisAgent {
  static async run(
    supabase: SupabaseClient,
    projectId: string,
    actorId?: string | null
  ): Promise<DiscoveryAnalysisRunResult> {
    // 1) اجمع بيانات المشروع + الـ Lead + إجابات الاكتشاف + snapshot
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, project_type, lead_id, clients(company_name)")
      .eq("id", projectId)
      .maybeSingle();

    if (!project) {
      return {
        status: "error",
        message: "المشروع غير موجود.",
        code: "NOT_FOUND",
        metadata: {},
      };
    }

    const companyName = Array.isArray(project.clients)
      ? project.clients[0]?.company_name ?? null
      : (project.clients as { company_name: string | null } | null)?.company_name ?? null;

    // Discovery Workspace: التحليل بيقرأ **كل جلسات الاكتشاف** مجمّعة
    // (مش الأخيرة بس) — معرفة تراكمية عبر كل الإدارات/الجلسات.
    const [{ data: lead }, aggregated] = await Promise.all([
      project.lead_id
        ? supabase
            .from("leads")
            .select("source, notes")
            .eq("id", project.lead_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getAggregatedDiscovery(supabase, projectId),
    ]);

    const answers = aggregated.mergedAnswers;
    const snapshot = aggregated.mergedSnapshot;
    const formId = null;

    // منع التشغيل بلا بيانات كافية — احترامًا لقاعدة "لا اختلاق"
    const pairs = aggregated.labeledPairs;
    if (pairs.length === 0) {
      return {
        status: "insufficient_data",
        message: "مفيش أي جلسة اكتشاف فيها إجابات كافية — الـ AI ما ينفعش يحلّل من الفراغ.",
      };
    }

    const discoveryVersionHash = computeVersionHash(answers);

    // 2) ابنِ الـ prompt
    const prompt = buildDiscoveryAnalysisPrompt({
      projectName: project.name,
      projectType: project.project_type as ProjectType,
      companyName,
      leadSource: lead?.source ?? null,
      leadNotes: lead?.notes ?? null,
      discoveryPairs: pairs,
      discoverySnapshot: snapshot,
      answers,
    });

    // 3) استدعِ AIService (retry داخلي bounded + logging عبر Provider Layer)
    const response = await AIService.execute(AITaskType.DISCOVERY_ANALYSIS, prompt, {
      actorId: actorId ?? undefined,
      projectId,
    });

    const baseMeta: Partial<DiscoveryAnalysisRunMetadata> = {
      provider: response.provider,
      model: response.model_used,
      latency_ms: response.latency_ms,
      input_tokens: response.token_usage?.input_tokens ?? null,
      output_tokens: response.token_usage?.output_tokens ?? null,
      total_tokens: response.token_usage?.total_tokens ?? null,
      estimated_cost_usd: response.cost ?? null,
      retry_count: 0,
      discovery_version_hash: discoveryVersionHash,
      discovery_form_id: formId,
    };

    if (!response.success) {
      return {
        status: "error",
        message: response.error?.message ?? "فشل غير معروف.",
        code: response.error?.code ?? "UNKNOWN",
        metadata: baseMeta,
      };
    }

    // 4) تحقّق من الـ Schema
    const validation = validateDiscoveryAnalysis(response.output);
    if (!validation.ok) {
      // لو الرد اتقطع لوصوله لحد Tokens، ده السبب الحقيقي — نوضّحه بدل
      // رسالة "ليس JSON صالحًا" العامة عشان التشخيص يبقى دقيق.
      const truncated = response.warnings.some((w) => w.includes("MAX_TOKENS"));
      const hint = truncated
        ? " (السبب: رد التحليل اتقطع لوصوله للحد الأقصى للـ Tokens — جرّب إعادة التحليل، والحل الدائم مطبّق برفع السقف)"
        : "";
      return {
        status: "error",
        message: `الرد لم يجتز الفحص: ${validation.reason}${hint}`,
        code: "INVALID_RESPONSE",
        metadata: baseMeta,
      };
    }

    // 5) إصلاح لطيف: ملء تسميات الأسئلة الناقصة من لقطة القالب (بدون تغيير محتوى)
    const repaired = backfillEvidenceLabels(validation.data, snapshot);

    return {
      status: "success",
      data: repaired,
      metadata: {
        provider: response.provider,
        model: response.model_used,
        latency_ms: response.latency_ms,
        input_tokens: response.token_usage?.input_tokens ?? null,
        output_tokens: response.token_usage?.output_tokens ?? null,
        total_tokens: response.token_usage?.total_tokens ?? null,
        estimated_cost_usd: response.cost ?? null,
        retry_count: 0,
        discovery_version_hash: discoveryVersionHash,
        discovery_form_id: formId,
      },
    };
  }
}
