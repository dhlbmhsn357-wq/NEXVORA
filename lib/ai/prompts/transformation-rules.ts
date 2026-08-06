/**
 * Prompt توليد قواعد التحويل — يملأ **فجوات** فوق قواعد حتمية جاهزة. لكل
 * حقل هدف بلا قاعدة أو منخفض الثقة، يقترح نوع قاعدة تحويل مناسبًا مع سبب
 * وثقة — من قائمة الأنواع المدعومة فقط، بلا اختراع أنواع.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا أي شرح أو مقدمة أو Markdown code fences.
- kind لازم يكون واحدًا من الأنواع المدعومة المذكورة فقط — ممنوع اختراع أنواع.
- لكل قاعدة: target_field، source_fields (مصفوفة)، kind، confidence (٠-١٠٠)، reason.
- لو الحقل محسوب، استخدم kind=formula وضع expression في config (مثل "[price] * [qty]").
- overall_note ملخّص موجز لأولويات المراجعة.
- كل النصوص بالعربية.`;

const SCHEMA_TEMPLATE = `{
  "rules": [
    { "target_field": "...", "source_fields": ["..."], "kind": "convert_date", "config": {}, "confidence": 0, "reason": "..." }
  ],
  "overall_note": "ملخّص"
}`;

export function buildTransformationRulesPrompt(context: string, supportedKinds: string[], gaps: string): string {
  return `أنت مهندس تحويل بيانات (Data Transformation Engineer) في ترحيل الأنظمة. لديك محرّك قواعد تحويل حتمي جاهز، لكن بعض الحقول بلا قاعدة أو بثقة منخفضة. مهمتك: اقتراح قواعد تحويل مناسبة لسدّ الفجوات **بالمعنى والسياق**.

## سياق المشروع (المخطّط + التنظيف)
${context}

## الأنواع المدعومة فقط
${supportedKinds.join("، ")}

## الفجوات التي تحتاج قواعد
${gaps}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
