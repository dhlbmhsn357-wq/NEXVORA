/**
 * NEXVORA Evidence Traceability — Types (P8)
 * ==========================================
 * ربط عناصر تعريف المنتج (Requirements/Stories/AC) بأدلة البحث والتحقق
 * (Market Research + Problem Validation).
 */

// أنواع الطرف المستهدف (المستنِد لدليل)
export type EvidenceSourceType =
  | "requirement"
  | "user_story"
  | "acceptance_criterion";

export const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "requirement", "user_story", "acceptance_criterion",
] as const;

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSourceType, string> = {
  requirement: "متطلب",
  user_story: "قصة",
  acceptance_criterion: "معيار قبول",
};

// أنواع الدليل (المصدر الذي يُستند إليه)
export type EvidenceKind = "market_research" | "problem_validation";

export const EVIDENCE_KINDS: readonly EvidenceKind[] = ["market_research", "problem_validation"] as const;

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  market_research: "بحث سوقي",
  problem_validation: "تحقق مشكلة",
};

export interface EvidenceLinkRow {
  id: string;
  projectId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  evidenceType: EvidenceKind;
  evidenceId: string;
  note: string;
  createdAt: string;
  createdBy: string | null;
}

/**
 * صيغة عرض جاهزة (بعد تجميع مع بيانات الدليل الفعلية) — يستخدمها الـ UI
 * لعرض بطاقة دليل واضحة بدل مجرّد id.
 */
export interface EvidenceLinkView {
  link: EvidenceLinkRow;
  evidenceTitle: string;
  evidenceSummary: string;
  evidenceUrl: string | null;
  /** درجة الاعتماد على هذا الدليل (0..100) — من confidence/strength في الأصل. */
  evidenceStrength: number;
}
