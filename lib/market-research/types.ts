/**
 * NEXVORA Market Research + Problem Validation + Info Classification — Types
 * ==========================================================================
 * الركائز الثلاث اللي بيبني عليها Product Definition في P5:
 *   • Market Research         — منافسون/اتجاهات/شرائح/تسعير
 *   • Problem Validation      — أدلة تحقّق الألم (مقابلات/استبيانات/…)
 *   • Info Classification     — تصنيف كل معلومة (unclassified/legacy/needs_review/verified)
 */

// ---------------------------------------------------------------------------
// Market Research
// ---------------------------------------------------------------------------
export type MarketResearchItemType =
  | "direct_competitor"    // منافس مباشر
  | "indirect_competitor"  // منافس غير مباشر
  | "market_trend"         // اتجاه سوق
  | "user_segment"         // شريحة مستخدمين
  | "pricing_model"        // نموذج تسعير
  | "swot"                 // تحليل SWOT
  | "other";               // أخرى

export const MARKET_RESEARCH_ITEM_TYPES: readonly MarketResearchItemType[] = [
  "direct_competitor", "indirect_competitor",
  "market_trend", "user_segment", "pricing_model", "swot", "other",
] as const;

export const MARKET_RESEARCH_TYPE_LABELS: Record<MarketResearchItemType, string> = {
  direct_competitor: "منافس مباشر",
  indirect_competitor: "منافس غير مباشر",
  market_trend: "اتجاه سوق",
  user_segment: "شريحة مستخدمين",
  pricing_model: "نموذج تسعير",
  swot: "SWOT",
  other: "أخرى",
};

/**
 * (0109) أصل الدليل — حقيقي/غير موثَّق/محاكاة. المشاريع التجريبية (mode='test')
 * تُنشئ عناصر جديدة بـ 'simulated' افتراضيًا (الـ UI بيمنع رفعها لـ verified_real).
 */
export type EvidenceOrigin = "unverified" | "verified_real" | "simulated";
export const EVIDENCE_ORIGINS: readonly EvidenceOrigin[] = ["unverified", "verified_real", "simulated"] as const;
export const EVIDENCE_ORIGIN_LABELS: Record<EvidenceOrigin, string> = {
  unverified: "غير موثَّق",
  verified_real: "دليل حقيقي",
  simulated: "محاكاة",
};

export interface MarketResearchItem {
  id: string;
  projectId: string;
  itemType: MarketResearchItemType;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  sourceUrl: string | null;
  sourceNotes: string;
  confidence: number;    // 0..100 — درجة الثقة في هذه المعلومة
  tags: string[];
  /** طبيعة المعلومة (0106): fact/inference/assumption/hypothesis/decision + القيم القديمة. */
  informationClass: InformationClassification;
  /** مستوى السرّية (0106): public/internal/confidential. */
  confidentiality: Confidentiality;
  /** أصل الدليل (0109). */
  origin: EvidenceOrigin;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Problem Validation
// ---------------------------------------------------------------------------
export type EvidenceType =
  | "user_interview"       // مقابلة مستخدم
  | "survey"               // استبيان
  | "analytics_data"       // بيانات تحليلية
  | "recorded_session"     // جلسة مسجّلة (screen recording)
  | "direct_observation"   // ملاحظة مباشرة
  | "internal_document"    // وثيقة داخلية
  | "support_ticket"       // تذكرة دعم
  | "other";

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  "user_interview", "survey", "analytics_data", "recorded_session",
  "direct_observation", "internal_document", "support_ticket", "other",
] as const;

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  user_interview: "مقابلة مستخدم",
  survey: "استبيان",
  analytics_data: "بيانات تحليلية",
  recorded_session: "جلسة مسجّلة",
  direct_observation: "ملاحظة مباشرة",
  internal_document: "وثيقة داخلية",
  support_ticket: "تذكرة دعم",
  other: "أخرى",
};

export interface ProblemValidationItem {
  id: string;
  projectId: string;
  evidenceType: EvidenceType;
  title: string;
  painPoint: string;         // العبارة اللي بتعرّف الألم
  quote: string;             // اقتباس مباشر (اختياري)
  sourcePerson: string;      // اسم/تعريف المصدر
  sourceRole: string;        // دور المصدر (مالك، مدير، مستخدم نهائي…)
  sourceDate: string | null;
  supportingUrl: string | null;
  supportingNotes: string;
  strength: number;          // 0..100 — قوة الدليل
  tags: string[];
  /** طبيعة المعلومة (0106). */
  informationClass: InformationClassification;
  /** مستوى السرّية (0106). */
  confidentiality: Confidentiality;
  /** أصل الدليل (0109). */
  origin: EvidenceOrigin;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Information Classification
// ---------------------------------------------------------------------------
/**
 * تحديث 0106: تم توسيع الاتحاد ليشمل طبيعة المعلومة (fact/inference/...)
 * بالإضافة إلى قيم الجودة القديمة. القيم القديمة تبقى صالحة للتوافق الخلفي.
 */
export type InformationClassification =
  | "unclassified"   // لسه ما اتصنّفتش (افتراضي)
  | "legacy"         // من مشروع أقدم — لازم مراجعة
  | "needs_review"   // فيها شك، محتاجة تحقّق
  | "verified"       // تم التحقق منها
  // طبيعة المعلومة (0106)
  | "fact"
  | "inference"
  | "assumption"
  | "hypothesis"
  | "decision";

export const INFORMATION_CLASSIFICATIONS: readonly InformationClassification[] = [
  "unclassified", "legacy", "needs_review", "verified",
  "fact", "inference", "assumption", "hypothesis", "decision",
] as const;

export const CLASSIFICATION_LABELS: Record<InformationClassification, string> = {
  unclassified: "غير مصنَّف",
  legacy: "قديم",
  needs_review: "يحتاج مراجعة",
  verified: "موثَّق",
  fact: "حقيقة",
  inference: "استنتاج",
  assumption: "افتراض",
  hypothesis: "فرضية",
  decision: "قرار",
};

/** مستوى السرّية (منفصل عن طبيعة المعلومة). */
export type Confidentiality = "public" | "internal" | "confidential";
export const CONFIDENTIALITY_LEVELS: readonly Confidentiality[] = ["public", "internal", "confidential"] as const;
export const CONFIDENTIALITY_LABELS: Record<Confidentiality, string> = {
  public: "عام", internal: "داخلي", confidential: "سرّي",
};

export interface InformationClassificationMark {
  id: string;
  projectId: string;
  sourceTable: string;
  sourceId: string;
  classification: InformationClassification;
  reason: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
