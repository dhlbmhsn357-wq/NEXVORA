/**
 * مصدر الحقيقة الوحيد لمدة تعبئة نموذج الاكتشاف المتوقعة — نفس الحساب
 * يُستخدم في صفحة الفورم العامة (app/discovery/[token]/discovery-portal.tsx)
 * وفي رسالة الدعوة على واتساب (lib/whatsapp/communication-service.ts)،
 * عشان الرقم المذكور للعميل يفضل متطابق في كل مكان دايمًا، مهما اتغيّر
 * عدد أسئلة القالب.
 */
export function computeEstimatedMinutesRange(questionCount: number): {
  lowMin: number;
  highMin: number;
} {
  const lowMin = Math.max(3, Math.round(questionCount * 0.4));
  const highMin = Math.round(questionCount * 0.7) + 2;
  return { lowMin, highMin };
}

/** جملة جاهزة للاستخدام داخل رسائل واتساب — بدون أي سياق تاني حواليها. */
export function formatEstimatedTimeLine(questionCount: number): string {
  const { lowMin, highMin } = computeEstimatedMinutesRange(questionCount);
  return `بيستغرق تقريباً ${lowMin} إلى ${highMin} دقيقة`;
}
