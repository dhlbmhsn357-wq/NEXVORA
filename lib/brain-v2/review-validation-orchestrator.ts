import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildBrainReviewValidationPrompt } from "@/lib/ai/prompts/brain-review-validation";
import { validateBrainReviewValidation } from "@/lib/ai/validation/brain-review-validation";
import { detectDuplicateKeys, detectCircularDependencies } from "@/lib/knowledge-graph/consistency-checker";
import { enumerateReviewObjects } from "./review-objects";
import { syncReviewObjectsForDocument } from "./review-objects-service";
import { formatBrainV2ForPrompt } from "./downstream-context";
import type { BrainContent } from "./types";
import type { BrainReviewIssue, BrainReviewObject, BrainReviewObjectDependency } from "@/lib/types/database";

const MAX_SUMMARY_CHARS = 3000;
function compositeKey(sectionKey: string, itemKey: string): string {
  return `${sectionKey}::${itemKey}`;
}

export type BrainReviewValidationResult = { status: "success"; reportId: string } | { status: "error"; message: string };

/**
 * محرّك تحقّق Brain Review (Phase 5) — بيشتغل *قبل* الاعتماد، على عكس
 * تحليل شبكة المعرفة (Phase 3) اللي بيشتغل بعد الاعتماد على
 * knowledge_nodes. بيعيد استخدام نفس الفحوصات الحتمية
 * (detectDuplicateKeys/detectCircularDependencies من consistency-
 * checker.ts) مباشرة على عناصر Brain Review — صفر منطق فحص مكرر —
 * زائد نداء AI واحد للفحوصات الدلالية (اكتمال/تعارض/روابط اعتماد).
 */
export async function runBrainReviewValidation(documentId: string, actorId: string | null): Promise<BrainReviewValidationResult> {
  const supabase: SupabaseClient = createServiceClient();

  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("id, project_id, content")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { status: "error", message: "الوثيقة غير موجودة." };

  const content = doc.content as BrainContent;
  await syncReviewObjectsForDocument(supabase, documentId, doc.project_id, content);

  const [{ data: objectsRaw }, { data: dependenciesRaw }] = await Promise.all([
    supabase.from("brain_review_objects").select("*").eq("document_id", documentId),
    supabase.from("brain_review_object_dependencies").select("*").eq("document_id", documentId),
  ]);
  const objects = (objectsRaw as BrainReviewObject[] | null) ?? [];
  const existingDependencies = (dependenciesRaw as BrainReviewObjectDependency[] | null) ?? [];
  if (objects.length === 0) return { status: "error", message: "لا توجد عناصر معرفة قابلة للمراجعة بعد." };

  const keyToId = new Map(objects.map((o) => [compositeKey(o.section_key, o.item_key), o.id]));
  const idToKey = new Map(objects.map((o) => [o.id, compositeKey(o.section_key, o.item_key)]));
  const validKeys = new Set(keyToId.keys());

  // فحوصات حتمية — تكرار مفتاح عبر أقسام مختلفة (id هنا هو المفتاح المركّب نفسه، مفيش حاجة لتحويل لاحق).
  const duplicateIssuesRaw = detectDuplicateKeys(objects.map((o) => ({ id: compositeKey(o.section_key, o.item_key), category: o.section_key, item_key: o.item_key, title: o.item_title })));
  const deterministicIssues: BrainReviewIssue[] = duplicateIssuesRaw.map((i) => ({
    type: "duplicate_key" as const,
    severity: i.severity as BrainReviewIssue["severity"],
    category: "تكرار",
    description: i.description,
    related_object_keys: i.node_ids,
  }));

  const currentSummary = formatBrainV2ForPrompt(content).slice(0, MAX_SUMMARY_CHARS);
  const promptItems = enumerateReviewObjects(content).map((e) => ({
    key: compositeKey(e.section_key, e.item_key),
    section: e.section_key,
    title: e.item_title,
  }));

  const prompt = buildBrainReviewValidationPrompt(currentSummary, promptItems);
  const response = await AIService.execute(AITaskType.BRAIN_REVIEW_VALIDATION, prompt, { projectId: doc.project_id });

  let aiIssues: BrainReviewIssue[] = [];
  let businessReadiness: number | null = null;
  let architectureReadiness: number | null = null;
  let technicalReadiness: number | null = null;
  let aiConfidence: number | null = null;
  let lastError: string | null = null;
  let newDependencyRows: { review_object_id: string; depends_on_review_object_id: string; relation_type: string }[] = [];

  if (response.success) {
    const validation = validateBrainReviewValidation(response.output, validKeys);
    if (validation.ok) {
      aiIssues = validation.data.issues;
      businessReadiness = validation.data.business_readiness;
      architectureReadiness = validation.data.architecture_readiness;
      technicalReadiness = validation.data.technical_readiness;
      aiConfidence = validation.data.ai_confidence;

      const existingPairSet = new Set(existingDependencies.map((d) => `${d.review_object_id}|${d.depends_on_review_object_id}|${d.relation_type}`));
      newDependencyRows = validation.data.dependency_pairs
        .map((p) => ({
          review_object_id: keyToId.get(p.from_key)!,
          depends_on_review_object_id: keyToId.get(p.to_key)!,
          relation_type: p.relation_type,
        }))
        .filter((r) => r.review_object_id && r.depends_on_review_object_id && !existingPairSet.has(`${r.review_object_id}|${r.depends_on_review_object_id}|${r.relation_type}`));
    } else {
      lastError = validation.reason;
    }
  } else {
    lastError = response.error?.message ?? "فشل استدعاء AI.";
  }

  if (newDependencyRows.length > 0) {
    await supabase.from("brain_review_object_dependencies").insert(
      newDependencyRows.map((r) => ({ document_id: documentId, project_id: doc.project_id, ...r, source: "ai_inferred" }))
    );
  }

  // كشف دورة اعتماد — على الروابط الموجودة + المقترحة حديثًا، بعد الإدخال، بنفس منطق KG بدون تكرار.
  // detectCircularDependencies بتفلتر على relation_type === "depends_on" فقط، فباقي الأنواع (conflicts_with/related_to) بتتفلتر تلقائيًا هناك.
  const combinedRelations: { from_node_id: string; to_node_id: string; relation_type: "depends_on" }[] = [
    ...existingDependencies
      .filter((d) => d.relation_type === "depends_on")
      .map((d) => ({ from_node_id: idToKey.get(d.review_object_id) ?? d.review_object_id, to_node_id: idToKey.get(d.depends_on_review_object_id) ?? d.depends_on_review_object_id, relation_type: "depends_on" as const })),
    ...newDependencyRows
      .filter((r) => r.relation_type === "depends_on")
      .map((r) => ({ from_node_id: idToKey.get(r.review_object_id) ?? r.review_object_id, to_node_id: idToKey.get(r.depends_on_review_object_id) ?? r.depends_on_review_object_id, relation_type: "depends_on" as const })),
  ];
  const circularIssuesRaw = detectCircularDependencies(combinedRelations);
  const circularIssues: BrainReviewIssue[] = circularIssuesRaw.map((i) => ({
    type: "conflicting_rule" as const,
    severity: i.severity as BrainReviewIssue["severity"],
    category: "دورة اعتماد",
    description: i.description,
    related_object_keys: i.node_ids,
  }));

  const { data: report, error } = await supabase
    .from("brain_review_validation_reports")
    .insert({
      document_id: documentId,
      project_id: doc.project_id,
      status: "ready",
      issues: [...deterministicIssues, ...circularIssues, ...aiIssues],
      business_readiness: businessReadiness,
      architecture_readiness: architectureReadiness,
      technical_readiness: technicalReadiness,
      ai_confidence: aiConfidence,
      last_error: lastError,
      requested_by: actorId,
    })
    .select("id")
    .single();

  if (error || !report) return { status: "error", message: `فشل حفظ تقرير التحقق: ${error?.message ?? "سبب غير معروف"}` };

  await supabase.from("brain_review_events").insert({
    document_id: documentId,
    project_id: doc.project_id,
    event_type: "validation_run",
    actor_id: actorId,
    payload: { report_id: report.id, issues_count: deterministicIssues.length + circularIssues.length + aiIssues.length },
  });

  return { status: "success", reportId: report.id };
}
