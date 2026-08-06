/**
 * Prompt تحقّق محاكاة الترحيل — طبقة استشارية **فوق** تقرير محاكاة حتمي
 * جاهز. لا يعيد حساب الأرقام؛ يفسّر النتائج ويستخرج رؤى تجارية ومخاطر
 * وتوصيات مستندة إلى الذاكرة المؤسسية والمجال — **بلا اختراع أرقام أو
 * مشاكل غير موجودة في التقرير**.
 */

const STRICT_RULES = `قواعد صارمة:
- أرجع كائن JSON فقط، بلا أي شرح أو Markdown code fences.
- لا تخترع أرقامًا أو مشاكل غير مذكورة في التقرير — استند للأرقام المعطاة فقط.
- business_consistency: هل النتائج منطقية تجاريًا؟ اذكر تناقضات حقيقية فقط.
- risk_prediction: رتّب المخاطر الفعلية من التقرير حسب الأثر، بلا تهويل.
- recommendations: خطوات عملية مرتّبة (ترتيب الجداول، الدفعات، إصلاح البيانات).
- كل النصوص بالعربية، موجزة ومباشرة.`;

const SCHEMA_TEMPLATE = `{
  "executive_summary": "ملخّص تنفيذي موجز لجاهزية الترحيل",
  "business_consistency": { "verdict": "consistent|minor_issues|inconsistent", "findings": ["..."] },
  "risk_prediction": [ { "title": "...", "level": "low|medium|high|critical", "reason": "...", "mitigation": "..." } ],
  "recommendations": ["..."],
  "go_no_go": "go|conditional_go|no_go"
}`;

export function buildSimulationValidationPrompt(reportDigest: string, domain: string, orgMemory: string): string {
  return `أنت مهندس ترحيل بيانات مؤسسي (Enterprise Data Migration Architect) في منهجية شبيهة بـSAP Activate. أمامك تقرير محاكاة ترحيل حتمي كامل (Digital Twin dry-run). مهمتك: التحقّق التجاري وتنبّؤ المخاطر واستخراج توصيات — **استنادًا للتقرير فقط**، بلا إعادة حساب.

## المجال
${domain}

## خلاصة تقرير المحاكاة (حتمية)
${reportDigest}

## الذاكرة المؤسسية (دروس ترحيلات سابقة)
${orgMemory || "لا دروس سابقة متاحة."}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
