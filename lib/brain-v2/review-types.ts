import type { BrainSectionKey } from "./types";

// ============================================================
// حالة المراجعة لكل قسم
// ============================================================

export type SectionReviewState = "approved" | "needs_review" | "rejected";

export interface SectionReview {
  state: SectionReviewState;
  reason: string | null;
  reviewer_id: string | null;
  reviewed_at: string; // ISO
}

/** map: section_key → SectionReview. الأقسام الغير موجودة = لم تتم مراجعتها بعد. */
export type SectionReviewsMap = Partial<Record<BrainSectionKey, SectionReview>>;

// ============================================================
// قرارات على العناصر (Missing Info + Assumptions)
// ============================================================

export type MissingInfoDisposition =
  | { state: "pending" }
  | { state: "ignored"; by: string | null; at: string; reason?: string | null }
  | { state: "resolved"; by: string | null; at: string; note?: string | null }
  | { state: "converted_to_meeting_question"; by: string | null; at: string };

export type AssumptionDisposition =
  | { state: "pending" }
  | { state: "accepted"; by: string | null; at: string }
  | { state: "rejected"; by: string | null; at: string; reason?: string | null }
  | { state: "converted_to_meeting_question"; by: string | null; at: string };

/** المفتاح = index داخل المصفوفة (كنص). */
export type MissingInfoDispositionsMap = Record<string, MissingInfoDisposition>;
export type AssumptionDispositionsMap = Record<string, AssumptionDisposition>;

// ============================================================
// إعدادات
// ============================================================

export interface BrainSettings {
  scope: "global";
  confidence_threshold_percent: number; // 0..100
  /** لو true: أي تغيير في Project Brain المعتمد بيشغّل إعادة توليد تلقائية
   * في الخلفية لأي مشتق (PRD/Prototype Prompt/Presentation/Handoff) عنده
   * محتوى بالفعل. افتراضيًا false — التوليد بيستهلك حصة AI حقيقية. */
  auto_resync_downstream: boolean;
  updated_at: string;
  updated_by: string | null;
}

// ============================================================
// تسميات عربية
// ============================================================

export const REVIEW_STATE_LABELS: Record<SectionReviewState, string> = {
  approved: "مُعتمد",
  needs_review: "يحتاج مراجعة",
  rejected: "مرفوض",
};

export const MISSING_INFO_LABELS: Record<MissingInfoDisposition["state"], string> = {
  pending: "بانتظار المراجعة",
  ignored: "تم تجاهله",
  resolved: "تم حله",
  converted_to_meeting_question: "حُوّل لسؤال اجتماع",
};

export const ASSUMPTION_LABELS: Record<AssumptionDisposition["state"], string> = {
  pending: "بانتظار المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
  converted_to_meeting_question: "حُوّل لسؤال اجتماع",
};
