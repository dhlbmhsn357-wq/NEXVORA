/**
 * Prompt استعادة أخطاء الترحيل الحقيقي — طبقة استشارية لخطأ **غير معروف**
 * أثناء التنفيذ. يقترح تصنيفًا وحلًّا آمنًا، **بلا اختراع**، مع تحديد ما إذا
 * كان الحلّ آمنًا للتطبيق التلقائي (بعد موافقة المدير) أم يحتاج مراجعة.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا شرح أو Markdown.
- action لازم يكون: retry أو skip أو review أو abort فقط.
- auto_safe=true فقط إذا كان الحلّ لا يفقد بيانات ولا يكسر علاقة.
- لا تقترح تخطّي (skip) صفوف إلا إذا كانت غير حرجة صراحةً.
- كل النصوص بالعربية وموجزة.`;

const SCHEMA = `{
  "error_class": "transient|constraint|resource|data|unknown",
  "action": "retry|skip|review|abort",
  "auto_safe": false,
  "suggestion": "الحلّ المقترح بإيجاز",
  "reason": "لماذا"
}`;

export function buildMigrationRecoveryPrompt(entity: string, errorMessage: string, context: string): string {
  return `أنت مهندس ترحيل بيانات مؤسسي يراقب تنفيذ ترحيل حقيقي (Production). فشلت دفعة بخطأ غير مصنَّف. اقترح استجابة آمنة.

## الكيان
${entity}

## رسالة الخطأ
${errorMessage}

## السياق
${context}

## المطلوب
أرجع **JSON فقط** بالشكل:
${SCHEMA}

${STRICT_RULES}`;
}
