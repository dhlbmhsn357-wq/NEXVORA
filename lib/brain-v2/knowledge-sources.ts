import type { BrainKnowledgeSourceType } from "@/lib/types/database";

/**
 * وزن الثقة الأساسي حسب مصدر المعرفة — نفس الأرقام المذكورة حرفيًا في
 * المواصفة (Meeting Decision 95%، Manual PM Decision 100%، Discovery
 * 80%، AI Suggestion 60%). القرار المعماري المؤكّد: الثقة دي بتعيش على
 * مستوى "المعلومة الجديدة" (Pending Change) بس، مش داخل بنية BrainContent
 * نفسها — كل قسم من الـ 19 فاضل زي ما هو بالظبط.
 */
export const CONFIDENCE_BY_SOURCE: Record<BrainKnowledgeSourceType, number> = {
  manual_note: 100,
  meeting_transcript: 95,
  meeting_review: 90,
  meeting_ai_analysis: 85,
  prototype_review: 75,
  support_feedback: 70,
};

export const KNOWLEDGE_SOURCE_LABELS: Record<BrainKnowledgeSourceType, string> = {
  manual_note: "ملاحظة يدوية من PM",
  meeting_transcript: "محضر اجتماع",
  meeting_review: "مراجعة اجتماع (خطة مقابل الفعلي)",
  meeting_ai_analysis: "تحليل AI للاجتماع",
  prototype_review: "مراجعة Prototype",
  support_feedback: "ملاحظات/طلبات العملاء",
};
