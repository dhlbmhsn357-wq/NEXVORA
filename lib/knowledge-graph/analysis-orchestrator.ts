import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildKnowledgeGraphAnalysisPrompt } from "@/lib/ai/prompts/knowledge-graph-analysis";
import { validateKnowledgeGraphAnalysis } from "@/lib/ai/validation/knowledge-graph-analysis";
import { buildDeterministicIssues } from "./consistency-checker";
import { detectDomainGaps } from "@/lib/domain-intelligence/domain-profiles";
import type { KnowledgeConsistencyIssue, KnowledgeNode, KnowledgeRelation, ProjectDomain } from "@/lib/types/database";

export type AnalysisResult =
  | { status: "success"; reportId: string }
  | { status: "error"; message: string };

/**
 * "تحليل شبكة المعرفة" — عند الطلب فقط (زر في الواجهة)، مش تلقائي على
 * كل تغيير. بيجمع: فحوصات حتمية بالكود (تكرار مفتاح/دورة اعتماد/علاقة
 * يتيمة) + فجوات المجال (Domain Checklist) + نداء AI واحد لفحوصات
 * المصطلحات/التكرار الدلالي واقتراح علاقات جديدة. النتيجة صف واحد في
 * knowledge_consistency_reports.
 */
export async function runKnowledgeGraphAnalysis(projectId: string, actorId: string | null): Promise<AnalysisResult> {
  const supabase = createServiceClient();

  const [{ data: nodesRaw }, { data: relationsRaw }, { data: project }] = await Promise.all([
    supabase.from("knowledge_nodes").select("*").eq("project_id", projectId).eq("status", "active"),
    supabase.from("knowledge_relations").select("*").eq("project_id", projectId),
    supabase.from("projects").select("domain").eq("id", projectId).maybeSingle(),
  ]);

  const nodes = (nodesRaw as KnowledgeNode[] | null) ?? [];
  const relations = (relationsRaw as KnowledgeRelation[] | null) ?? [];

  if (nodes.length === 0) {
    return { status: "error", message: "لا توجد عناصر معرفة بعد — تأكد إن فيه نسخة معتمدة من Project Brain." };
  }

  const deterministicIssues = buildDeterministicIssues(nodes, relations);
  const domain = (project?.domain as ProjectDomain | null) ?? "generic";
  const domainGaps = detectDomainGaps(domain, nodes.map((n) => n.title));

  const existingPairs = relations.map((r) => `${r.from_node_id} → ${r.to_node_id}`);
  const prompt = buildKnowledgeGraphAnalysisPrompt(
    nodes.map((n) => ({ id: n.id, category: n.category, title: n.title, description: n.description })),
    existingPairs
  );

  const response = await AIService.execute(AITaskType.KNOWLEDGE_GRAPH_ANALYSIS, prompt, { projectId });

  let aiIssues: KnowledgeConsistencyIssue[] = [];
  let relationsInsertedCount = 0;

  if (response.success) {
    const validNodeIds = new Set(nodes.map((n) => n.id));
    const validation = validateKnowledgeGraphAnalysis(response.output, validNodeIds);
    if (validation.ok) {
      aiIssues = [
        ...validation.data.terminologyIssues.map((i) => ({
          type: "inconsistent_terminology" as const,
          severity: "low" as const,
          description: i.description,
          node_ids: i.node_ids,
        })),
        ...validation.data.semanticDuplicates.map((i) => ({
          type: "semantic_duplicate" as const,
          severity: "medium" as const,
          description: i.description,
          node_ids: i.node_ids,
        })),
      ];

      const existingPairSet = new Set(relations.map((r) => `${r.from_node_id}|${r.to_node_id}|${r.relation_type}`));
      const newRelations = validation.data.proposedRelations.filter(
        (r) => !existingPairSet.has(`${r.from_id}|${r.to_id}|${r.relation_type}`)
      );
      if (newRelations.length > 0) {
        const { error } = await supabase.from("knowledge_relations").insert(
          newRelations.map((r) => ({
            project_id: projectId,
            from_node_id: r.from_id,
            to_node_id: r.to_id,
            relation_type: r.relation_type,
            inferred_by: "ai",
          }))
        );
        if (!error) relationsInsertedCount = newRelations.length;
      }
    }
  }
  // فشل نداء الـ AI مايوقفش التقرير كله — الفحوصات الحتمية أهم جزء
  // ومحسوبة بالفعل؛ بس بنسجّل الفشل كـ Issue واضح بدل ما نختفيه.
  if (!response.success) {
    aiIssues = [
      {
        type: "inconsistent_terminology",
        severity: "low",
        description: `تعذّر تشغيل فحص المصطلحات/العلاقات بالذكاء الاصطناعي: ${response.error?.message ?? "سبب غير معروف"}. الفحوصات الحتمية تحت لسه سليمة.`,
        node_ids: [],
      },
    ];
  }

  const { data: report, error } = await supabase
    .from("knowledge_consistency_reports")
    .insert({
      project_id: projectId,
      status: "ready",
      issues: [...deterministicIssues, ...aiIssues],
      domain_gaps: domainGaps,
      relations_inferred_count: relationsInsertedCount,
      requested_by: actorId,
    })
    .select("id")
    .single();

  if (error || !report) {
    return { status: "error", message: `فشل حفظ تقرير التحليل: ${error?.message ?? "سبب غير معروف"}` };
  }

  return { status: "success", reportId: report.id };
}
