import type { BrainReviewIssueSeverity, BrainReviewIssueType, BrainReviewObjectState } from "@/lib/types/database";

export const REVIEW_OBJECT_STATE_LABELS: Record<BrainReviewObjectState, string> = {
  pending_review: "بانتظار المراجعة",
  approved: "معتمد",
  approved_with_modification: "معتمد بتعديل",
  needs_revision: "يحتاج تعديل",
  rejected: "مرفوض",
  deferred: "مؤجّل",
  blocked: "محظور",
};

export const REVIEW_ISSUE_TYPE_LABELS: Record<BrainReviewIssueType, string> = {
  duplicate_key: "تكرار",
  circular_dependency: "دورة اعتماد",
  orphan_relation: "علاقة يتيمة",
  missing_requirement: "متطلب مفقود",
  conflicting_rule: "قاعدة متعارضة",
  undefined_entity: "كيان غير معرّف",
  unresolved_decision: "قرار معلّق",
  unanswered_question: "سؤال بلا إجابة",
  security_weakness: "ثغرة أمان",
  scalability_risk: "خطر قابلية توسّع",
  architecture_inconsistency: "تعارض معماري",
  inconsistent_terminology: "مصطلحات غير متسقة",
  operational_readiness_gap: "فجوة جاهزية تشغيلية",
};

export const REVIEW_ISSUE_SEVERITY_LABELS: Record<BrainReviewIssueSeverity, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};
