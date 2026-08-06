/**
 * الدروس المستفادة (Lessons Learned) — **وحدة نقية بلا I/O**.
 *
 * تُجمّع تلقائيًا من نتائج الترحيل والتحقّق: المشاكل، حلولها، أفضل الممارسات،
 * والتوصيات. تُضاف بعد الاعتماد إلى الذاكرة المؤسسية لتحسين مشاريع المستقبل.
 */

import type { Lesson, LessonsReport } from "./verification-types";

export interface LessonsInput {
  domain: string;
  dataMismatches: number;
  brokenRelations: number;
  businessFailures: number;
  openIssues: number;
  reviewTasks: number;
  chunkSize: number;
  workerCount: number;
  durationMin: number;
  finalScore: number;
}

export function buildLessons(input: LessonsInput): LessonsReport {
  const lessons: Lesson[] = [];

  if (input.dataMismatches > 0) {
    lessons.push({ category: "problem", title: "فروق في أعداد السجلات", detail: `${input.dataMismatches} كيانًا لم تتطابق أعداده — تحقّق من التصفية/التخطّي قبل الترحيل القادم.` });
    lessons.push({ category: "solution", title: "تسوية الفروق قبل الاعتماد", detail: "طابِق قواعد التخطّي/الأرشفة مع توقّعات العميل، ووثّق الفروق المبرَّرة صراحةً." });
  }
  if (input.brokenRelations > 0) {
    lessons.push({ category: "problem", title: "علاقات مكسورة", detail: `${input.brokenRelations} مرجعًا مكسورًا — رحّل الجداول المرجعية/الأب أولًا.` });
  }
  if (input.reviewTasks > 0) {
    lessons.push({ category: "problem", title: "دفعات دخلت المراجعة", detail: `${input.reviewTasks} دفعة احتاجت مراجعة — راجع أنماط الأخطاء لأتمتة الاستعادة.` });
  }

  lessons.push({ category: "best_practice", title: `إعدادات ترحيل ناجحة — ${input.domain}`, detail: `Batch ${input.chunkSize}، عمّال ${input.workerCount}، مدّة ${input.durationMin} دقيقة، درجة نهائية ${input.finalScore}/100.` });
  lessons.push({ category: "best_practice", title: "اعتماد متعدّد الجهات", detail: "اعتماد الأقسام والفروع بشكل مستقل قلّل مخاطر اكتشاف مشاكل بعد الإطلاق." });

  if (input.openIssues > 0) {
    lessons.push({ category: "recommendation", title: "أغلق المشكلات المفتوحة قبل الإطلاق", detail: `${input.openIssues} مشكلة مفتوحة — لا تُصدر الشهادة قبل إغلاقها أو قبولها رسميًا.` });
  } else {
    lessons.push({ category: "recommendation", title: "جاهز للإغلاق ومرحلة Hypercare", detail: "لا مشكلات مفتوحة — انتقل لمراقبة ما بعد الإطلاق (المرحلة ٨)." });
  }

  return {
    lessons,
    summary: `${input.domain}: درجة ${input.finalScore}/100، ${input.dataMismatches} فرق، ${input.brokenRelations} علاقة مكسورة، ${input.openIssues} مشكلة مفتوحة.`,
  };
}
