/**
 * Prompt تحليل الـSchema Mapping — يهذّب مخطّطًا **حتميًا جاهزًا** (لا
 * يبدأ من الصفر). الذكاء الاصطناعي يقترح تطابقات للحقول منخفضة الثقة/غير
 * المطابَقة، ويشرح المنطق — مستندًا إلى النموذج القياسي ومعرفة المجال، بلا
 * اختراع حقول غير موجودة.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- suggestions: لكل حقل قديم منخفض الثقة أو غير مطابَق، اقترح أفضل حقل قياسي (new_field) من قائمة الحقول القياسية المعطاة فقط — ممنوع اختراع حقول جديدة.
- إن لم يوجد تطابق منطقي، اترك new_field = null واذكر السبب في reason.
- confidence رقم ٠-١٠٠ يعكس قوّة التطابق الدلالي.
- transformation_hint: نوع التحويل المقترَح إن لزم (مثل date_conversion، phone_formatting، status_mapping) أو "none".
- overall_note: ملاحظة موجزة عن جودة المخطّط وأهم ما يحتاج مراجعة بشرية.
- كل النصوص بالعربية.`;

const SCHEMA_TEMPLATE = `{
  "suggestions": [
    { "old_object": "...", "old_field": "...", "new_field": "مفتاح حقل قياسي أو null", "confidence": 0, "reason": "...", "transformation_hint": "none" }
  ],
  "overall_note": "ملاحظة موجزة عن المخطّط وأولويات المراجعة"
}`;

export function buildSchemaMappingPrompt(
  blueprintSummary: string,
  targetFieldsByEntity: Record<string, string[]>,
  domainContext: string
): string {
  const fieldsList = Object.entries(targetFieldsByEntity)
    .map(([entity, fields]) => `- ${entity}: ${fields.join("، ")}`)
    .join("\n");

  return `أنت خبير ترحيل أنظمة (Data Migration Architect). لديك مخطّط Mapping حتمي جاهز يربط نظامًا قديمًا بنموذج قياسي جديد. مهمتك: تحسين التطابقات منخفضة الثقة أو غير المطابَقة **بالمعنى والسياق**، لا بأسماء الأعمدة فقط.

## المخطّط الحتمي الجاهز
${blueprintSummary}

## الحقول القياسية المتاحة في النظام الجديد (لا تخترع غيرها)
${fieldsList}

${domainContext ? `## سياق المجال والخبرة المؤسسية (للاسترشاد)\n${domainContext}\n` : ""}
## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
