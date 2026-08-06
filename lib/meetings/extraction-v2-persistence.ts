import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingExtractionV2, MeetingExtractionV2Category } from "@/lib/types/database";

/**
 * بيحوّل MeetingExtractionV2 (JSON من الـ AI) لصفوف حقيقية موزّعة على
 * جداول Migration 0050 — بدل ما تفضل jsonb blob واحد زي القديم.
 * إضافي بحت: بيتنفذ بجانب saveExtractionToBrain (v1) القديمة، مفيش أي
 * لمس لمسار Brain الحالي.
 *
 * تتبّع القرارات: كل قرار من كل اجتماع بيتسجّل كصف مستقل (status=active)
 * — مفيش أي Overwrite تلقائي أو حذف صامت. كشف/دمج القرارات المتعارضة
 * بين اجتماعات مختلفة عمل يدوي مستقبلي (موضّح في تقرير الترحيل)، مش
 * تلقائي هنا — القرار ده متعمّد عشان "مين قال الحقيقة" قرار بشري.
 */
export async function saveExtractionV2ToNormalizedTables(
  supabase: SupabaseClient,
  projectId: string,
  meetingId: string,
  data: MeetingExtractionV2
): Promise<void> {
  const decisionsRows = data.decisions.map((item) => ({
    meeting_id: meetingId,
    project_id: projectId,
    text: item.text,
    confidence_score: item.confidence_score,
    evidence_quote: item.evidence_quote,
    speaker_guess: item.speaker_guess,
  }));
  if (decisionsRows.length > 0) await supabase.from("meeting_decisions").insert(decisionsRows);

  const requirementRows = [
    ...data.functional_requirements.map((item) => ({ ...item, requirement_type: "functional" as const })),
    ...data.non_functional_requirements.map((item) => ({ ...item, requirement_type: "non_functional" as const })),
  ].map((item) => ({
    meeting_id: meetingId,
    project_id: projectId,
    text: item.text,
    requirement_type: item.requirement_type,
    confidence_score: item.confidence_score,
    evidence_quote: item.evidence_quote,
  }));
  if (requirementRows.length > 0) await supabase.from("meeting_requirements").insert(requirementRows);

  const riskRows = data.risks.map((item) => ({
    meeting_id: meetingId,
    project_id: projectId,
    text: item.text,
    confidence_score: item.confidence_score,
    evidence_quote: item.evidence_quote,
  }));
  if (riskRows.length > 0) await supabase.from("meeting_risks").insert(riskRows);

  const questionRows = data.questions.map((item) => ({
    meeting_id: meetingId,
    project_id: projectId,
    text: item.text,
    confidence_score: item.confidence_score,
    evidence_quote: item.evidence_quote,
  }));
  if (questionRows.length > 0) await supabase.from("meeting_questions").insert(questionRows);

  const taskRows = data.tasks.map((item) => ({
    meeting_id: meetingId,
    project_id: projectId,
    text: item.text,
    confidence_score: item.confidence_score,
    evidence_quote: item.evidence_quote,
  }));
  if (taskRows.length > 0) await supabase.from("meeting_tasks").insert(taskRows);

  const GENERIC_CATEGORIES: MeetingExtractionV2Category[] = [
    "business_rules",
    "pain_points",
    "constraints",
    "ideas",
    "dependencies",
    "conflicts",
    "missing_information",
  ];
  const CATEGORY_SINGULAR: Record<string, string> = {
    business_rules: "business_rule",
    pain_points: "pain_point",
    constraints: "constraint",
    ideas: "idea",
    dependencies: "dependency",
    conflicts: "conflict",
    missing_information: "missing_information",
  };
  const extractedItemRows = GENERIC_CATEGORIES.flatMap((category) =>
    data[category].map((item) => ({
      meeting_id: meetingId,
      project_id: projectId,
      category: CATEGORY_SINGULAR[category],
      text: item.text,
      confidence_score: item.confidence_score,
      evidence_quote: item.evidence_quote,
    }))
  );
  if (extractedItemRows.length > 0) await supabase.from("meeting_extracted_items").insert(extractedItemRows);

  await supabase.from("meeting_ai_results").insert({
    meeting_id: meetingId,
    project_id: projectId,
    pipeline_version: "v2",
    raw_ai_output: data,
    confidence_overall: data.overall_confidence,
  });
}
