import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildMeetingReviewPrompt } from "@/lib/ai/prompts/meeting-review";
import { validateMeetingReviewSynthesis } from "@/lib/ai/validation/meeting-review";
import { buildPlanSnapshot, compareMeetingPlanToTranscript } from "./plan-comparison";
import { writeLifecycleEvent } from "./live-session-service";
import { proposeChanges, type KnowledgeCandidate } from "@/lib/brain-v2/knowledge-aggregation";
import type { MeetingExtraction, MeetingPresentation, MeetingPresentationSlides } from "@/lib/types/database";

/**
 * Meeting Review — بعد اكتمال تفريغ وتحليل الاجتماع، لو الاجتماع مرتبط
 * بعرض تقديمي (يعني جه من Meeting Presentation / Live Meeting Mode)،
 * بيقارن خطة الاجتماع بالنص الفعلي، يولّد مراجعة كاملة، ثم يقترح
 * النتائج (قرارات/مهام/مخاطر/افتراضات جديدة) كـ Pending Changes عبر
 * Knowledge Aggregation Layer (source_type='meeting_review') — مصدر
 * معرفة منفصل تمامًا عن source_type='meeting_ai_analysis" الموجود من
 * قبل، عشان الاثنين يفضلوا واضحين في الـ Activity Log والـ Knowledge Graph.
 */
export async function maybeGenerateMeetingReview(
  projectId: string,
  meetingId: string,
  extraction: MeetingExtraction,
  actorId: string | null
): Promise<void> {
  const supabase = createServiceClient();

  const { data: presentation } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!presentation) return; // اجتماع عادي (رفع مباشر بدون عرض تقديمي) — مفيش خطة نقارنها، تجاهل بهدوء.

  const pres = presentation as MeetingPresentation;
  const plan = buildPlanSnapshot(pres.slides as MeetingPresentationSlides);

  const { data: reviewRow, error: insertError } = await supabase
    .from("meeting_reviews")
    .insert({ project_id: projectId, meeting_id: meetingId, presentation_id: pres.id, status: "generating", plan_snapshot: plan })
    .select("id")
    .single();
  if (insertError || !reviewRow) {
    console.error(`[MeetingReview] فشل إنشاء صف المراجعة لاجتماع ${meetingId}:`, insertError?.message);
    return;
  }

  const heuristic = compareMeetingPlanToTranscript(plan, extraction);
  const { data: transcriptRow } = await supabase.from("transcripts").select("raw_text").eq("meeting_id", meetingId).maybeSingle();
  const rawTranscript = transcriptRow?.raw_text ?? "";

  let discussed = heuristic.discussed;
  let notDiscussed = heuristic.notDiscussed;
  let openQuestions = heuristic.openQuestions;
  let newAssumptions: string[] = [];

  try {
    const prompt = buildMeetingReviewPrompt(plan, extraction, heuristic, rawTranscript);
    const response = await executeAIWithRateLimitWait(AITaskType.MEETING_REVIEW_SYNTHESIS, prompt, { actorId: actorId ?? undefined, projectId });
    if (response.success) {
      const validation = validateMeetingReviewSynthesis(response.output);
      if (validation.ok) {
        discussed = validation.data.discussed;
        notDiscussed = validation.data.not_discussed;
        openQuestions = validation.data.open_questions;
        newAssumptions = validation.data.new_assumptions;
      }
    }
    // فشل الـ AI (Rate Limit أو غيره) → نكمل بالتصنيف الحتمي (Heuristic)
    // بس، بدون افتراضات جديدة (مفيش مصدر تاني لاستخراجها بدون AI).
  } catch (err) {
    console.error(`[MeetingReview] AI synthesis threw for meeting ${meetingId}:`, err);
  }

  await supabase
    .from("meeting_reviews")
    .update({
      status: "ready",
      discussed,
      not_discussed: notDiscussed,
      open_questions: openQuestions,
      new_decisions: extraction.decisions,
      new_tasks: [...extraction.requests, ...extraction.deadlines],
      new_risks: extraction.risks,
      new_assumptions: newAssumptions,
    })
    .eq("id", reviewRow.id);

  await writeLifecycleEvent(supabase, projectId, meetingId, "analysis_completed", "اكتملت مراجعة الاجتماع (مقارنة الخطة بالنص الفعلي)", actorId);

  const candidates: KnowledgeCandidate[] = [
    ...extraction.decisions.map((d) => ({ sectionKey: "known_facts" as const, newValue: { fact: d, category: "قرار من الاجتماع", evidence: [] }, rationale: "قرار جديد من Meeting Review" })),
    ...[...extraction.requests, ...extraction.deadlines].map((t) => ({
      sectionKey: "roadmap" as const,
      newValue: { phase: t, description: "مهمة/موعد من الاجتماع", deliverables: [], evidence: [] },
      rationale: "مهمة جديدة من Meeting Review",
    })),
    ...extraction.risks.map((r) => ({
      sectionKey: "risks" as const,
      newValue: { risk: r, cause: "مذكور في الاجتماع", likelihood: "medium" as const, impact: "medium" as const, evidence: [] },
      rationale: "خطر جديد من Meeting Review",
    })),
    ...newAssumptions.map((a) => ({
      sectionKey: "assumptions" as const,
      newValue: { statement: a, reason: "افتراض صريح ذُكر في الاجتماع", evidence: [] },
      rationale: "افتراض جديد من Meeting Review",
    })),
  ];

  try {
    const result = await proposeChanges(projectId, "meeting_review", meetingId, `مراجعة اجتماع: ${pres.title || "اجتماع"}`, candidates);
    await writeLifecycleEvent(
      supabase,
      projectId,
      meetingId,
      "brain_updated",
      result.proposedCount > 0
        ? `تم اقتراح ${result.proposedCount} تحديث على Project Brain من هذا الاجتماع (بانتظار مراجعة PM)`
        : "لا توجد تحديثات جديدة على Project Brain من هذا الاجتماع",
      actorId
    );
  } catch (err) {
    console.error(`[MeetingReview] proposeChanges threw for meeting ${meetingId}:`, err);
  }

  await writeLifecycleEvent(supabase, projectId, meetingId, "presentation_updated", "اكتملت مراجعة العرض التقديمي بعد الاجتماع", actorId);
}
