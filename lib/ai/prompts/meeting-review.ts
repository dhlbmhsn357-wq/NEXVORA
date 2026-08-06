import type { MeetingExtraction, MeetingReviewPlanSnapshot } from "@/lib/types/database";
import type { PlanComparisonResult } from "@/lib/meeting-presentation/plan-comparison";

/**
 * Prompt توليد مراجعة الاجتماع — بيدّي للـ AI خطة الاجتماع كاملة، النص
 * المستخرج (extraction)، والتصنيف الحتمي الأولي (Heuristic) كـ Hints
 * بس، ويطلب منه صياغة نهائية واضحة + استخراج "الافتراضات الجديدة"
 * تحديدًا (الحقل الوحيد اللي مفيش له مصدر بيانات جاهز أصلًا).
 */
export function buildMeetingReviewPrompt(
  plan: MeetingReviewPlanSnapshot,
  extraction: MeetingExtraction,
  heuristic: PlanComparisonResult,
  rawTranscript: string
): string {
  return `أنت مساعد يراجع اجتماع فعلي حصل بين فريق ووكالة تطوير، ويقارنه بخطة الاجتماع اللي كانت معدّة له.

## خطة الاجتماع (اللي كان مفروض يتغطى)
الأجندة: ${JSON.stringify(plan.agenda)}
الأسئلة المجهّزة: ${JSON.stringify(plan.questions)}
القرارات المفتوحة: ${JSON.stringify(plan.openDecisions)}

## البيانات المستخرجة من الاجتماع الفعلي (استخراج آلي سابق، دقيق)
قرارات اتخذت: ${JSON.stringify(extraction.decisions)}
مخاطر ذُكرت: ${JSON.stringify(extraction.risks)}
طلبات: ${JSON.stringify(extraction.requests)}
أسئلة مفتوحة: ${JSON.stringify(extraction.questions)}
مواعيد نهائية: ${JSON.stringify(extraction.deadlines)}

## تصنيف أولي حتمي (Hints فقط، راجعها ونقّحها لو غير دقيقة)
تمت مناقشته (تصنيف أولي): ${JSON.stringify(heuristic.discussed)}
لم تتم مناقشته (تصنيف أولي): ${JSON.stringify(heuristic.notDiscussed)}
أسئلة مفتوحة (تصنيف أولي): ${JSON.stringify(heuristic.openQuestions)}

## نص الاجتماع المفرّغ (للرجوع إليه فقط عند الحاجة لدقة أعلى)
${rawTranscript.slice(0, 12000)}

## المطلوب منك بالضبط
راجع التصنيف الأولي ونقّحه بناءً على فهمك الحقيقي للسياق، واستخرج **الافتراضات الجديدة فقط** (جمل صريحة في النص تدل على افتراض تم أخذه كمسلّمة أثناء النقاش، مثل "هنفترض إن..."، "على أساس إن...") — لو مفيش أي افتراض صريح مذكور، أرجع مصفوفة فاضية، ممنوع اختراع أي افتراض غير موجود حرفيًا في النص.

أرجع **JSON فقط** بالشكل التالي بالضبط:
{
  "discussed": ["بند من الخطة تمت مناقشته فعليًا"],
  "not_discussed": ["بند من الخطة لم تتم مناقشته"],
  "open_questions": ["سؤال لسه محتاج إجابة"],
  "new_assumptions": ["افتراض صريح جديد ذُكر في النص، أو مصفوفة فاضية"]
}

قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- discussed وnot_discussed لازم يغطوا نفس بنود الخطة بالضبط (الأجندة + القرارات المفتوحة) بدون تكرار أو حذف.
- كل نص بنفس لغة المدخلات (عربي).`;
}
