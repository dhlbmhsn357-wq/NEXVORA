/**
 * Prompt تحليل جودة البيانات — يهذّب **تحليل جودة حتمي جاهز**. الذكاء
 * الاصطناعي يقترح تصحيحات للقيم غير الصالحة/الناقصة ويشرح المنطق مستندًا
 * إلى معرفة المجال والخبرة المؤسسية — بلا اختراع بيانات جديدة، ولا تطبيق.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا أي شرح أو مقدمة أو Markdown code fences.
- suggestions: لكل مشكلة معطاة، اقترح تصحيحًا محدّدًا (corrected_value) أو null لو غير ممكن.
- ممنوع اختراع بيانات لا سند لها؛ التصحيح لازم يكون تطبيعًا/تصحيحًا منطقيًا للقيمة الموجودة.
- confidence رقم ٠-١٠٠. أي قيمة أقل من ٩٥ تبقى للمراجعة البشرية.
- reason جملة تشرح لماذا هذا التصحيح، ومصدر المنطق (معيار مجال/نمط شائع).
- overall_note ملخّص موجز لأولويات التنظيف قبل الترحيل.
- كل النصوص بالعربية.`;

const SCHEMA_TEMPLATE = `{
  "suggestions": [
    { "object": "...", "field": "...", "row_index": 0, "corrected_value": "قيمة مصحّحة أو null", "confidence": 0, "reason": "..." }
  ],
  "overall_note": "ملخّص أولويات التنظيف"
}`;

export function buildDataQualityPrompt(qualitySummary: string, sampleIssues: string, domainContext: string): string {
  return `أنت خبير جودة بيانات (Data Quality Engineer) في ترحيل الأنظمة. لديك تحليل جودة حتمي جاهز لمجموعة بيانات عميل. مهمتك: اقتراح تصحيحات ذكية للمشاكل منخفضة الثقة **بالمعنى والسياق**، لا مجرد قواعد ثابتة.

## ملخّص الجودة الحتمي
${qualitySummary}

## عيّنة من المشاكل التي تحتاج قرارًا
${sampleIssues}

${domainContext ? `## سياق المجال والخبرة المؤسسية (للاسترشاد)\n${domainContext}\n` : ""}
## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
