/**
 * Prompt تحقّق ما بعد الترحيل (Go-Live) — طبقة استشارية **فوق** تقرير تحقّق
 * حتمي جاهز. يقارن سلوك الأعمال قبل/بعد، ويكشف السلوك المفقود/غير المتوقّع
 * والمشكلات الخفية والاختناقات — **مستندًا للتقرير فقط، بلا اختراع**.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا شرح أو Markdown.
- لا تخترع أرقامًا أو مشاكل غير مذكورة في التقرير.
- business_consistency: هل سلوك الأعمال بعد الترحيل مطابق (أو أفضل)؟
- hidden_problems: مشاكل خفية محتملة من الأنماط في التقرير فقط.
- recommendations: خطوات عملية قبل الإطلاق.
- كل النصوص بالعربية وموجزة.`;

const SCHEMA = `{
  "executive_summary": "ملخّص تنفيذي لجاهزية الإطلاق",
  "business_consistency": { "verdict": "consistent|minor_gaps|inconsistent", "findings": ["..."] },
  "hidden_problems": [ { "title": "...", "severity": "low|medium|high|critical", "reason": "..." } ],
  "recommendations": ["..."],
  "go_live_opinion": "go|conditional|hold"
}`;

export function buildGoLiveVerificationPrompt(reportDigest: string, domain: string): string {
  return `أنت مهندس قبول أعمال (Business Acceptance Lead) في ترحيل أنظمة مؤسسية. أمامك تقرير تحقّق حتمي بعد ترحيل حقيقي (بيانات + منطق أعمال + صحة + KPIs). مهمتك: مقارنة سلوك الأعمال قبل/بعد وكشف المشاكل الخفية — **استنادًا للتقرير فقط**.

## المجال
${domain}

## خلاصة تقرير التحقّق (حتمية)
${reportDigest}

## المطلوب
أرجع **JSON فقط** بالشكل:
${SCHEMA}

${STRICT_RULES}`;
}
