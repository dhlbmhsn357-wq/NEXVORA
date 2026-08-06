import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildRecommendationsPromptV2, type KnowledgeGraphContextV2, type SimilarProjectInputV2 } from "@/lib/ai/prompts/recommendations-v2";
import { validateRecommendationsV2 } from "@/lib/ai/validation/recommendations-v2";
import { upsertProjectEmbeddingFromBrain } from "./project-embedding";
import { findSimilarProjects } from "./similarity";
import { runKnowledgeGraphAnalysis } from "@/lib/knowledge-graph/analysis-orchestrator";
import { computeWeightNudge, applyWeightNudge } from "./weight-learning";
import type {
  ProjectRecommendation,
  ProjectSimilarityMatch,
  RecommendationDependency,
  RecommendationStatus,
  KnowledgeNode,
  KnowledgeConsistencyReport,
  ProjectDomain,
} from "@/lib/types/database";

const MAX_SUMMARY_CHARS = 3000;
const KNOWLEDGE_ITEMS_PER_PROJECT = 5;
const MAX_NODES_PER_CATEGORY = 8;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...تم اختصار الباقي...]` : text;
}

async function buildKnowledgeSummaryForProject(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data: sources } = await supabase
    .from("organizational_knowledge_sources")
    .select("knowledge_id")
    .eq("project_id", projectId)
    .limit(50);
  const knowledgeIds = [...new Set((sources ?? []).map((s) => s.knowledge_id as string))];
  if (knowledgeIds.length === 0) return "(لا توجد معرفة مستخرجة بعد من هذا المشروع)";

  const { data: items } = await supabase
    .from("organizational_knowledge")
    .select("category, title, content")
    .in("id", knowledgeIds)
    .in("status", ["validated", "approved"])
    .limit(KNOWLEDGE_ITEMS_PER_PROJECT);
  const rows = (items ?? []) as Array<{ category: string; title: string; content: string }>;
  if (rows.length === 0) return "(لا توجد معرفة مُعتمدة بعد من هذا المشروع)";
  return rows.map((r) => `- [${r.category}] ${r.title}: ${r.content}`).join("\n");
}


/** أقصى عدد عناصر معرفة مستندية بتدخل سياق التوصيات. */
const DOCUMENT_KNOWLEDGE_LIMIT = 40;

/**
 * ملخّص معرفة مركز المعرفة للمشروع الحالي.
 *
 * بنفضّل العناصر عالية الثقة والمرتبطة بالقيود والقواعد والتكاملات —
 * دي اللي بتغيّر قرارًا معماريًا فعلًا. الوصف العام مالوش تأثير على
 * التوصية وبياخد مساحة من السياق المحدود.
 *
 * الدالة متسامحة مع غياب جداول هجرة 0071.
 */
async function buildDocumentKnowledgeSummary(
  supabase: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("category, title, content, confidence")
    .eq("project_id", projectId)
    .eq("status", "active")
    .gte("confidence", 60)
    .order("confidence", { ascending: false })
    .limit(DOCUMENT_KNOWLEDGE_LIMIT);

  if (error || !data || data.length === 0) return null;

  const rows = data as Array<{ category: string; title: string; content: string }>;
  return rows.map((r) => `- [${r.category}] ${r.title}: ${r.content}`).join("\n");
}

/**
 * ملخص المشروع من مرحلة الاكتشاف (ما قبل الـ Brain) — الأفضلية لتحليل
 * الاكتشاف المكتمل (مُهيكل وغني)، وإلا إجابات الاكتشاف الخام المجمّعة.
 * بيرجّع null لو مفيش أي بيانات اكتشاف بعد.
 */
async function buildDiscoverySummaryForProject(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data: analysis } = await supabase
    .from("discovery_analyses")
    .select("output")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const output = analysis?.output as {
    executive_summary?: { summary?: string };
    business_model?: { overview?: string; how_it_works?: string };
    business_goals?: { items?: Array<{ goal?: string }> };
    functional_requirements?: { items?: Array<{ statement?: string }> };
    non_functional_requirements?: Record<string, unknown>;
    risks?: { items?: Array<{ risk?: string }> };
    suggested_user_roles?: { items?: Array<{ role?: string }> };
  } | null;

  if (output?.executive_summary?.summary) {
    const parts: string[] = [`## الملخص التنفيذي\n${output.executive_summary.summary}`];
    if (output.business_model?.overview) {
      parts.push(`## نموذج العمل\n${output.business_model.overview}\n${output.business_model.how_it_works ?? ""}`);
    }
    const goals = (output.business_goals?.items ?? []).map((g) => g.goal).filter(Boolean);
    if (goals.length) parts.push(`## الأهداف\n${goals.map((g) => `- ${g}`).join("\n")}`);
    const reqs = (output.functional_requirements?.items ?? []).map((r) => r.statement).filter(Boolean);
    if (reqs.length) parts.push(`## المتطلبات الوظيفية\n${reqs.map((r) => `- ${r}`).join("\n")}`);
    const risks = (output.risks?.items ?? []).map((r) => r.risk).filter(Boolean);
    if (risks.length) parts.push(`## المخاطر\n${risks.map((r) => `- ${r}`).join("\n")}`);
    const roles = (output.suggested_user_roles?.items ?? []).map((r) => r.role).filter(Boolean);
    if (roles.length) parts.push(`## الأدوار\n${roles.join("، ")}`);
    return parts.join("\n\n");
  }

  // مفيش تحليل مكتمل — جرّب إجابات الاكتشاف الخام المجمّعة من كل الجلسات.
  try {
    const { getAggregatedDiscovery } = await import("@/lib/discovery-portal/aggregate-sessions");
    const aggregated = await getAggregatedDiscovery(supabase, projectId);
    if (aggregated.labeledPairs.length === 0) return null;
    return `## إجابات الاكتشاف (خام)\n${aggregated.labeledPairs
      .map((p: { label: string; value: string }) => `- ${p.label}: ${p.value}`)
      .join("\n")}`;
  } catch {
    return null;
  }
}

/** يجمّع سياق شبكة المعرفة (Phase 3) — بيشغّل تحليل جديد لو مفيش تقرير محفوظ أصلًا، صفر منطق تناسق مكرر. */
async function buildKnowledgeGraphContext(
  supabase: SupabaseClient,
  projectId: string,
  actorId: string | null
): Promise<{ context: KnowledgeGraphContextV2; activeNodes: KnowledgeNode[] }> {
  const [{ data: nodesRaw }, { data: project }] = await Promise.all([
    supabase.from("knowledge_nodes").select("*").eq("project_id", projectId).eq("status", "active"),
    supabase.from("projects").select("domain").eq("id", projectId).maybeSingle(),
  ]);
  const activeNodes = (nodesRaw as KnowledgeNode[] | null) ?? [];
  const domain = (project?.domain as ProjectDomain | null) ?? null;

  let { data: report } = await supabase
    .from("knowledge_consistency_reports")
    .select("*")
    .eq("project_id", projectId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report && activeNodes.length > 0) {
    const result = await runKnowledgeGraphAnalysis(projectId, actorId);
    if (result.status === "success") {
      const { data: fresh } = await supabase.from("knowledge_consistency_reports").select("*").eq("id", result.reportId).maybeSingle();
      report = fresh;
    }
  }

  const activeKnowledgeByCategory: Record<string, string[]> = {};
  for (const node of activeNodes) {
    const list = activeKnowledgeByCategory[node.category] ?? [];
    if (list.length < MAX_NODES_PER_CATEGORY) list.push(node.title);
    activeKnowledgeByCategory[node.category] = list;
  }

  const typedReport = report as KnowledgeConsistencyReport | null;
  return {
    context: {
      domain,
      domainGaps: typedReport?.domain_gaps ?? [],
      consistencyIssues: (typedReport?.issues ?? []).map((i) => ({ type: i.type, description: i.description })),
      activeKnowledgeByCategory,
    },
    activeNodes,
  };
}

/**
 * التوصيات الذكية (Phase 4) — بتتشغّل عند اعتماد Project Brain (أو عند
 * الطلب المباشر). بدليلين مستقلين: (1) مشاريع سابقة مشابهة (زي قبل
 * كده)، (2) نتائج تحليل شبكة المعرفة (Phase 3 — مشاكل تناسق/فجوات
 * مجال، بلا أي حاجة لتاريخ مشابه). مشروع من غير أي مشروع سابق مشابه
 * لسه بياخد توصيات حقيقية طالما عنده شبكة معرفة (بعد أول اعتماد Brain).
 */
export class RecommendationsEngine {
  static async generateForProject(projectId: string, actorId: string | null = null): Promise<{ generated: number } | { skipped: string }> {
    const supabase = createServiceClient();

    // مصدر ملخص المشروع: Brain المعتمد لو موجود، وإلا **تحليل الاكتشاف**
    // — التوصيات دلوقتي مرحلة قبل الـ Brain في سير العمل، فلازم تشتغل
    // من بيانات الاكتشاف مباشرة حتى قبل ما يتبني/يعتمد أي Brain.
    const brain = await getBrainForDownstreamGeneration(supabase, projectId);
    let currentSummary: string | null = brain ? formatBrainV2ForPrompt(brain.content) : null;
    if (!currentSummary) {
      currentSummary = await buildDiscoverySummaryForProject(supabase, projectId);
    }
    if (!currentSummary) {
      return {
        skipped:
          "لا يوجد Project Brain ولا تحليل اكتشاف مكتمل بعد — شغّل «التحليل» في تبويب التحليل أولًا (بعد استلام إجابات العميل) ثم ولّد التوصيات.",
      };
    }

    if (brain) {
      // الـ Embedding بيتبني من الـ Brain — بدونه (مرحلة ما قبل الـ Brain)
      // التشابه بيترك ببساطة ونعتمد على الدليل الذاتي.
      await upsertProjectEmbeddingFromBrain(supabase, projectId);
    }
    const similar: ProjectSimilarityMatch[] = brain ? await findSimilarProjects(supabase, projectId) : [];

    const { context: graphContext, activeNodes } = await buildKnowledgeGraphContext(supabase, projectId, actorId);
    const hasGraphEvidence = graphContext.domainGaps.length > 0 || graphContext.consistencyIssues.length > 0 || activeNodes.length > 0;

    // مفيش دليل عبر-مشاريع ولا شبكة معرفة؟ منرفضش زي قبل كده — نفعّل
    // وضع الدليل الذاتي: توصيات معمارية/فنية مبنية على بيانات المشروع نفسه.
    const selfEvidenceMode = similar.length === 0 && !hasGraphEvidence;

    // مركز المعرفة: المستندات الرسمية للعميل (سياسات، إجراءات تشغيل،
    // أدلة، تشريعات). التوصيات المبنية على الاكتشاف وحده بتفوّت القيود
    // الحقيقية المدفونة في المستندات دي، فبنضمّها للسياق.
    const documentKnowledge = await buildDocumentKnowledgeSummary(supabase, projectId);
    if (documentKnowledge) {
      currentSummary = `${currentSummary}

## معرفة مستخرجة من مستندات المشروع (Knowledge Hub)
${documentKnowledge}`;
    }

    currentSummary = truncate(currentSummary, MAX_SUMMARY_CHARS);
    const similarInputs: SimilarProjectInputV2[] = await Promise.all(
      similar.map(async (s) => ({
        project_name: s.project_name,
        similarity_score: s.similarity_score,
        knowledge_summary: await buildKnowledgeSummaryForProject(supabase, s.project_id),
      }))
    );

    const prompt = buildRecommendationsPromptV2(currentSummary, similarInputs, graphContext, selfEvidenceMode);
    const aiResponse = await AIService.execute(AITaskType.PROJECT_RECOMMENDATIONS, prompt, { projectId });
    if (!aiResponse.success) return { skipped: aiResponse.error?.message ?? "فشل استدعاء AI." };

    const validated = validateRecommendationsV2(aiResponse.output, similar.length - 1);
    if (!validated.ok) return { skipped: validated.reason };

    // في وضع الدليل الذاتي بنسجّلها كـ knowledge_graph (تحليل داخلي) —
    // قيد الـ CHECK في القاعدة بيقبل similarity/knowledge_graph/both فقط.
    const evidenceSource = similar.length > 0 && hasGraphEvidence ? "both" : similar.length > 0 ? "similarity" : "knowledge_graph";
    const insertedIds: (string | null)[] = [];

    for (const rec of validated.data) {
      const supportingProjectIds = rec.supporting_project_indexes.map((i) => similar[i]?.project_id).filter((v): v is string => !!v);
      const { data: inserted, error } = await supabase
        .from("project_recommendations")
        .insert({
          project_id: projectId,
          category: rec.category,
          recommendation: rec.recommendation,
          rationale: rec.rationale,
          confidence_score: rec.confidence_score,
          supporting_project_ids: supportingProjectIds,
          status: "suggested",
          priority: rec.priority,
          severity: rec.severity,
          business_value: rec.business_value,
          technical_value: rec.technical_value,
          affected_modules: rec.affected_modules,
          acceptance_criteria: rec.acceptance_criteria,
          implementation_notes: rec.implementation_notes,
          potential_risks: rec.potential_risks,
          expected_benefits: rec.expected_benefits,
          estimated_complexity: rec.estimated_complexity,
          evidence_source: evidenceSource,
          version: 1,
        })
        .select("id")
        .single();

      insertedIds.push(inserted?.id ?? null);
      if (!error && inserted) {
        await supabase.from("recommendation_versions").insert({
          recommendation_id: inserted.id,
          project_id: projectId,
          version: 1,
          snapshot: rec,
          change_reason: "توليد أولي",
        });
      }
    }

    // العلاقات بين التوصيات — بعد إدخال الدفعة كلها، عشان depends_on_indexes (فهارس داخل نفس الدفعة) تترجم لـ IDs حقيقية.
    const dependencyRows = validated.data.flatMap((rec, i) => {
      const fromId = insertedIds[i];
      if (!fromId) return [];
      return rec.depends_on_indexes
        .map((depIdx) => insertedIds[depIdx])
        .filter((toId): toId is string => !!toId && toId !== fromId)
        .map((toId) => ({ project_id: projectId, recommendation_id: fromId, depends_on_recommendation_id: toId }));
    });
    if (dependencyRows.length > 0) {
      await supabase.from("recommendation_dependencies").insert(dependencyRows);
    }

    return { generated: insertedIds.filter(Boolean).length };
  }

  static async getState(projectId: string) {
    const supabase = createServiceClient();
    const [{ data: recommendations }, { data: dependencies }] = await Promise.all([
      supabase.from("project_recommendations").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("recommendation_dependencies").select("*").eq("project_id", projectId),
    ]);
    return {
      recommendations: (recommendations as ProjectRecommendation[] | null) ?? [],
      dependencies: (dependencies as RecommendationDependency[] | null) ?? [],
    };
  }

  /** "مفيش قرار مقبول بيختفي" — أي تغيير حالة بيتسجّل كنسخة جديدة، مش استبدال صامت. */
  static async setStatus(
    recommendationId: string,
    status: RecommendationStatus,
    actorId: string | null = null,
    reason: string | null = null
  ): Promise<void> {
    const supabase = createServiceClient();
    const { data: current } = await supabase.from("project_recommendations").select("*").eq("id", recommendationId).maybeSingle();
    if (!current) return;

    const nextVersion = (current.version ?? 1) + 1;
    await supabase
      .from("project_recommendations")
      .update({ status, decided_by: actorId, decided_at: new Date().toISOString(), decision_reason: reason, version: nextVersion })
      .eq("id", recommendationId);

    await supabase.from("recommendation_versions").insert({
      recommendation_id: recommendationId,
      project_id: current.project_id,
      version: nextVersion,
      snapshot: { ...current, status, decision_reason: reason },
      change_reason: `تغيير الحالة إلى ${status}`,
      changed_by: actorId,
    });

    await nudgeSourceKnowledgeWeight(supabase, current.supporting_project_ids as string[], status);
  }
}

/**
 * تعلّم الوزن (best-effort) — لما توصية تُقبل/تُرفض، بينحرّك learned_weight
 * للمعرفة التنظيمية المصدَرة من نفس المشاريع الداعمة (supporting_project_ids).
 * ربط تقريبي بالمشروع المصدر، مش FK دقيق لعنصر معرفة بعينه — موثّق
 * كتوسّع مستقبلي دقيق أكتر لو احتجناه.
 */
async function nudgeSourceKnowledgeWeight(supabase: SupabaseClient, supportingProjectIds: string[], status: RecommendationStatus): Promise<void> {
  const direction = computeWeightNudge(status);
  if (!direction || supportingProjectIds.length === 0) return;

  const { data: sources } = await supabase.from("organizational_knowledge_sources").select("knowledge_id").in("project_id", supportingProjectIds).limit(20);
  const knowledgeIds = [...new Set((sources ?? []).map((s) => s.knowledge_id as string))];
  if (knowledgeIds.length === 0) return;

  const { data: knowledgeRows } = await supabase.from("organizational_knowledge").select("id, learned_weight").in("id", knowledgeIds);
  for (const row of knowledgeRows ?? []) {
    await supabase
      .from("organizational_knowledge")
      .update({ learned_weight: applyWeightNudge(row.learned_weight as number, direction) })
      .eq("id", row.id);
  }
}
