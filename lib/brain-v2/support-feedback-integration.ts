import { createServiceClient } from "@/lib/supabase/service";
import { proposeChanges, type KnowledgeCandidate } from "./knowledge-aggregation";
import type { SupportRequest } from "@/lib/types/database";

/**
 * طلبات دعم محلولة (Customer Requests / Client Feedback) بتتحوّل
 * لمرشحي معرفة — بس لو فيها إشارة حقيقية تستحق الانتباه: طلب تغيير/
 * ميزة صريح من العميل، أو تقييم رضا سلبي (مخاطر حقيقية على العلاقة/
 * جودة المنتج). طلبات الاستخدام العادية (أسئلة/توضيحات) مالهاش تأثير
 * على Brain — مش كل تفاعل دعم فني هو معرفة جديدة.
 */
function buildCandidates(request: SupportRequest): KnowledgeCandidate[] {
  const candidates: KnowledgeCandidate[] = [];
  const summary = "problem_description" in request.structured_summary ? request.structured_summary.problem_description : null;
  if (!summary) return candidates;

  if (request.request_type === "change_request" || request.request_type === "feature_request") {
    candidates.push({
      sectionKey: "suggested_features",
      newValue: { title: summary, rationale: "طلب صريح من العميل عبر الدعم الفني", priority: "medium", evidence: [] },
      rationale: "طلب تغيير/ميزة من طلب دعم محلول",
    });
  }

  if (request.satisfaction_rating === -1) {
    candidates.push({
      sectionKey: "risks",
      newValue: {
        risk: `عدم رضا العميل عن التعامل مع: ${summary}`,
        cause: "تقييم سلبي على طلب دعم محلول",
        likelihood: "medium",
        impact: "medium",
        evidence: [],
      },
      rationale: "تقييم رضا سلبي من العميل",
    });
  }

  return candidates;
}

export async function proposeSupportFeedbackChange(projectId: string, requestId: string): Promise<{ proposedCount: number }> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("support_requests").select("*").eq("id", requestId).maybeSingle();
  if (!data) return { proposedCount: 0 };

  const candidates = buildCandidates(data as SupportRequest);
  if (candidates.length === 0) return { proposedCount: 0 };

  const result = await proposeChanges(projectId, "support_feedback", requestId, "ملاحظات من طلب دعم محلول", candidates);
  return { proposedCount: result.proposedCount };
}
