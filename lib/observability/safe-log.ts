const MAX_LOGGED_CHARS = 300;

/**
 * يقصّر أي نص قبل طباعته في console.error — بعض رسائل الأخطاء
 * (خصوصًا رسائل التحقق من ردود AI) ممكن تحمل جزء من محتوى المشروع
 * أو رد النموذج نفسه بدون حد أقصى. القص هنا وقائي بس، مش تصنيف
 * حساسية كامل — الهدف منع تسريب نصوص طويلة لـ Logs بلا داعي.
 */
export function truncateForLog(message: string): string {
  if (message.length <= MAX_LOGGED_CHARS) return message;
  return `${message.slice(0, MAX_LOGGED_CHARS)}… (${message.length - MAX_LOGGED_CHARS} حرف إضافي مقصوص)`;
}
