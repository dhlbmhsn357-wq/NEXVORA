/**
 * تحويل رمز خطأ AIService/Provider إلى رسالة عربية واضحة للمستخدم.
 * مشتركة بين كل المهام (تحليل الاكتشاف، استخراج الاجتماعات، ...).
 */
export function friendlyAiErrorMessage(code: string, rawMessage: string): string {
  switch (code) {
    case "RATE_LIMIT":
      // rawMessage جاي من GeminiProvider ومحتوي فعليًا على تفاصيل مفيدة
      // (مدة الانتظار المقترحة من Google، وتشخيص هل فيه مفتاح مدفوع
      // مُجرَّب أصلًا ولا لأ) — بنسيبها زي ما هي بدل ما نلخّصها ونضيّع
      // التفاصيل دي، وبس نضيف مقدمة عربية واضحة قبلها.
      return `تم تجاوز حصة الذكاء الاصطناعي الحالية (Google Gemini). ${rawMessage}`;
    case "TIMEOUT":
      return "استغرقت العملية وقتًا أطول من المتوقع. جرّب إعادة المحاولة.";
    case "AUTHENTICATION":
    case "CONFIGURATION":
      return "خدمة الذكاء الاصطناعي غير مُعدّة بشكل صحيح — تأكد من GEMINI_API_KEY في الإعدادات.";
    case "INVALID_RESPONSE":
      return rawMessage || "لم نتمكن من فهم نتيجة الذكاء الاصطناعي.";
    default:
      return rawMessage || "حدث خطأ غير متوقع.";
  }
}
