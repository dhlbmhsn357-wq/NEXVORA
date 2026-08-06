import type { MeetingExtraction, MeetingPresentationSlides, MeetingReviewPlanSnapshot } from "@/lib/types/database";

/**
 * منطق حتمي خالص (بدون AI) لمقارنة خطة الاجتماع (من شرائح العرض)
 * بالنص المستخرج من الاجتماع الفعلي — بيُستخدم كـ Hints تُغذّى لـ AI
 * Synthesis، وكـ Fallback مضمون لو التوليد فشل (صفر بيانات مفقودة).
 */

/** كلمات قصيرة/شائعة بتتجاهل في المطابقة عشان متأثرش على نسبة التشابه. */
const STOPWORDS = new Set(["من", "في", "على", "إلى", "عن", "مع", "ما", "لا", "هل", "و", "أو", "ال"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s،,.؟!?؛:()\[\]"'«»]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  );
}

/**
 * يبني لقطة الخطة من شرائح العرض (الأجندة/الأسئلة/القرارات المفتوحة) —
 * بعد ترقية المخطط لشرائح بنيوية غنية (راجع lib/types/database.ts)،
 * الأجندة بقت مبنية من نقاط الملخص التنفيذي + عناوين الأهداف، والأسئلة
 * من شريحة "أسئلة مفتوحة" تحديدًا. مفهوم "قرارات مفتوحة" (معلّقة) مالوش
 * مقابل مباشر في المخطط الجديد — الشريحة المقابلة (client_decisions)
 * بتعرض قرارات اتخذت فعليًا، مش معلّقة، فبتفضل مصفوفة فاضية دايمًا.
 */
export function buildPlanSnapshot(slides: MeetingPresentationSlides): MeetingReviewPlanSnapshot {
  const agenda = [
    ...(slides.executive_summary?.key_points ?? []),
    ...(slides.business_goals?.goals.map((g) => g.title) ?? []),
  ];
  const questions = slides.open_questions?.questions.map((q) => q.question) ?? [];
  const openDecisions: string[] = [];
  return { agenda, questions, openDecisions };
}

/**
 * نسبة تشابه بسيطة (Jaccard على الكلمات المشتركة) — عنصر الخطة يُعتبر
 * "تمت مناقشته" لو تشابه بنسبة كافية مع أي عنصر من النص المستخرج.
 */
export function isPlanItemDiscussed(planItem: string, transcriptCorpus: string[], threshold = 0.3): boolean {
  const planTokens = tokenize(planItem);
  if (planTokens.size === 0) return false;

  for (const item of transcriptCorpus) {
    const itemTokens = tokenize(item);
    if (itemTokens.size === 0) continue;
    let shared = 0;
    for (const t of planTokens) if (itemTokens.has(t)) shared++;
    const overlapRatio = shared / planTokens.size;
    if (overlapRatio >= threshold) return true;
  }
  return false;
}

export interface PlanComparisonResult {
  discussed: string[];
  notDiscussed: string[];
  openQuestions: string[];
}

/**
 * يقارن خطة الاجتماع الكاملة (أجندة + أسئلة + قرارات مفتوحة) بالنص
 * المستخرج (قرارات/طلبات/مواعيد نهائية) — بيرجّع تصنيف حتمي وقابل
 * للاختبار الكامل بدون أي استدعاء AI.
 */
export function compareMeetingPlanToTranscript(
  plan: MeetingReviewPlanSnapshot,
  extraction: MeetingExtraction
): PlanComparisonResult {
  const transcriptCorpus = [...extraction.decisions, ...extraction.requests, ...extraction.deadlines, ...extraction.risks];

  const discussed: string[] = [];
  const notDiscussed: string[] = [];
  for (const item of [...plan.agenda, ...plan.openDecisions]) {
    if (isPlanItemDiscussed(item, transcriptCorpus)) discussed.push(item);
    else notDiscussed.push(item);
  }

  const openQuestions: string[] = [];
  for (const q of plan.questions) {
    if (!isPlanItemDiscussed(q, transcriptCorpus)) openQuestions.push(q);
  }
  // أي سؤال جديد اتطرح فعليًا في الاجتماع نفسه (من extraction.questions)
  // ولسه معلّق — يُضاف كمان، بدون تكرار لو موجود أصلًا.
  for (const q of extraction.questions) {
    if (!openQuestions.includes(q)) openQuestions.push(q);
  }

  return { discussed, notDiscussed, openQuestions };
}
