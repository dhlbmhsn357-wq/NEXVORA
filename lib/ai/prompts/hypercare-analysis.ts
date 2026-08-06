/**
 * Prompt تحليل Hypercare — طبقة استشارية **فوق** تقرير مراقبة حتمي جاهز.
 * يحلّل جذر السبب الحقيقي (لا العرض) للحوادث، ويقترح تحسينات ودروسًا —
 * **مستندًا للتقرير فقط، بلا اختراع**.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا شرح أو Markdown.
- root_cause: السبب الحقيقي الجذري، لا العَرَض الظاهر.
- لا تخترع أرقامًا أو مشاكل غير موجودة في التقرير.
- recommendations: خطوات عملية للتحسين والاستقرار.
- lessons: دروس قابلة للترقية (يراجعها المدير).
- كل النصوص بالعربية وموجزة.`;

const SCHEMA = `{
  "executive_summary": "ملخّص حالة Hypercare",
  "root_cause_analysis": [ { "incident": "...", "root_cause": "...", "confidence": 0 } ],
  "recommendations": ["..."],
  "lessons": ["..."],
  "stability_opinion": "stable|watch|unstable"
}`;

export function buildHypercareAnalysisPrompt(reportDigest: string, domain: string): string {
  return `أنت مهندس Hypercare مؤسسي (Site Reliability + Business Ops) تراقب مشروعًا بعد الإطلاق. أمامك تقرير مراقبة حتمي (صحة + شذوذ + حوادث + اتجاهات). مهمتك: تحليل جذور الأسباب الحقيقية واقتراح تحسينات ودروس — **استنادًا للتقرير فقط**.

## المجال
${domain}

## خلاصة تقرير المراقبة (حتمية)
${reportDigest}

## المطلوب
أرجع **JSON فقط** بالشكل:
${SCHEMA}

${STRICT_RULES}`;
}
