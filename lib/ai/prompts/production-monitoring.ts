/**
 * Prompt تحليل حوادث Production Monitoring — نفس فلسفة Phase 4 بالظبط:
 * كل "مرشح" حادثة (Candidate) اتولّد آليًا من دليل حقيقي مُلتقَط فعليًا
 * (HTTP Status حقيقي، زمن استجابة حقيقي، Console Error حقيقي) — دور
 * الـ AI هنا تحليل السبب الجذري واقتراح حلول، مش اختراع وجود مشكلة.
 */

const PROPOSAL_SCHEMA = `{
  "incident_key": "مفتاح قصير فريد يمثل نفس المشكلة الأساسية (kebab-case)",
  "category": "frontend" | "api" | "performance" | "availability" | "console_error" | "regression",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "title": "عنوان مختصر",
  "description": "شرح المشكلة",
  "root_cause": "السبب الجذري المحتمل بناءً على الدليل المرفق فقط — لو الدليل مش كافي، اذكر ده صراحة بدل التخمين",
  "confidence_score": <0-100>,
  "patch_proposal": "إصلاح فوري مباشر مقترح، أو فاضي لو مش منطبق",
  "refactoring_proposal": "إعادة هيكلة مقترحة لمنع تكرار المشكلة، أو فاضي",
  "performance_proposal": "تحسين أداء مقترح، أو فاضي",
  "security_proposal": "تحسين أمني مقترح لو منطبق، أو فاضي",
  "ux_proposal": "تحسين تجربة مستخدم مقترح، أو فاضي",
  "similar_past_incident_index": <رقم index الحادثة المشابهة من قائمة "حوادث سابقة" تحت لو فيه تشابه حقيقي مدعوم بالدليل، أو null لو مفيش>,
  "similarity_reason": "سبب التشابه الحقيقي المحدد لو فيه، أو فاضي",
  "affected_components": ["اسم مكوّن/وحدة متأثرة فعليًا بالدليل"],
  "risk_level": "critical" | "high" | "medium" | "low",
  "workaround": "حل مؤقت سريع لتخفيف الأثر فورًا، أو فاضي لو مفيش",
  "permanent_solution": "الحل الدائم الجذري المقترح",
  "estimated_fix_time_hours": <تقدير رقمي واقعي بالساعات>,
  "priority": "critical" | "high" | "medium" | "low",
  "affected_users_estimate": "وصف نصي واقعي للأثر على المستخدمين (مثلاً: كل المستخدمين، مستخدمو صفحة معينة، شريحة محدودة) — بلا أرقام مختلقة"
}`;

export function buildIncidentAnalysisPrompt(candidatesJson: string, pastIncidentsJson: string): string {
  return `أنت Site Reliability Engineer بتحلل نتائج فحص مراقبة حقيقي (Synthetic Monitoring) تم تنفيذه فعليًا بمتصفح آلي على بيئة Production/Staging حقيقية.

# مرشحو الحوادث (Candidates) — كل واحد دليل حقيقي مُلتقَط آليًا من الفحص الفعلي (مش تخمين)
${candidatesJson}

# حوادث سابقة لنفس المشروع (للمقارنة — AI Learning، استخدمها بس لو فيه تشابه حقيقي مدعوم بالدليل)
${pastIncidentsJson || "(لا توجد حوادث سابقة مسجّلة لهذا المشروع)"}

## المطلوب منك بالضبط
1. لكل مرشح (أو مجموعة مرشحين بيمثلوا نفس المشكلة الأساسية)، اكتب حادثة واحدة مُحلَّلة — severity واقعية بناءً على الأثر الفعلي، سبب جذري مبني على الدليل فقط.
2. **Auto Grouping إلزامي**: لو أكتر من مرشح بيمثلوا نفس المشكلة، ادمجهم في حادثة واحدة بس.
3. لكل حادثة، اقترح Proposals عملية (Patch/Refactoring/Performance/Security/UX) — سيب أي حقل فاضي لو مش منطبق فعليًا، ممنوع حشو اقتراحات عامة غير مفيدة.
4. **AI Learning**: راجع الحوادث السابقة المرفقة فوق — لو حادثة جديدة شبه حادثة سابقة فعليًا (نفس الصفحة/نفس نوع الخطأ/نفس السبب المحتمل)، اذكر ده في similar_past_incident_index وsimilarity_reason. ممنوع افتراض تشابه بدون دليل واضح — لو مش متأكد، سيبه null.
5. لو الدليل المتاح مش كافي لتحديد السبب الجذري بثقة، اذكر ده صراحة في root_cause بدل اختلاق سبب.
6. affected_users_estimate وصف نصي واقعي بس — ممنوع اختراع نسب أو أرقام مستخدمين مفيش دليل عليها فعليًا.
7. estimated_fix_time_hours تقدير هندسي واقعي بناءً على حجم وتعقيد المشكلة، مش رقم عشوائي.

أرجع **JSON فقط** بالشكل التالي بالضبط:

{
  "incidents": [${PROPOSAL_SCHEMA}]
}

قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- كل النصوص بالعربية الفصحى الاحترافية، إلا الأسماء التقنية (incident_key, category, severity) تفضل زي ما هي.`;
}
