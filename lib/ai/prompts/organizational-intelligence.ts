const KNOWLEDGE_CATEGORIES = [
  "business_pattern", "architecture_decision", "ux_decision", "ui_pattern",
  "reusable_component", "common_requirement", "common_risk", "common_integration",
  "common_bug", "common_mistake", "successful_solution", "failed_solution",
  "performance_lesson", "security_lesson", "deployment_lesson", "support_lesson",
  "customer_feedback_pattern", "meeting_decision_pattern", "technical_decision", "best_practice",
];

const RECOMMENDATION_CATEGORIES = [
  "features", "architecture", "security", "performance", "integrations",
  "user_roles", "business_rules", "roadmap", "kpis", "user_stories",
  "meeting_questions", "discovery_improvements", "risk_mitigation",
];

export interface KnowledgeExtractionSourceInput {
  brainSummary: string | null;
  engineeringQaSummary: string | null;
  supportSummary: string | null;
  monitoringSummary: string | null;
  prototypeReviewSummary: string | null;
  brainReviewSummary: string | null;
  fixPromptSummary: string | null;
}

/**
 * برومبت استخراج المعرفة — بعد أرشفة مشروع. الشرط الأهم: أي عنصر معرفة
 * لازم يكون Pattern قابل لإعادة الاستخدام (مش تفصيلة خاصة بالعميل/المشروع
 * نفسه) — ممنوع أي اسم عميل، اسم مشروع، بيانات دخول، أو تفاصيل تجارية
 * خاصة. لو المصدر فاضي أو غير كافٍ، يرجع مصفوفة فاضية بدل اختلاق معرفة.
 */
export function buildKnowledgeExtractionPrompt(sources: KnowledgeExtractionSourceInput): string {
  const parts: string[] = [];
  if (sources.brainSummary) parts.push(`## Project Brain (المعتمد)\n${sources.brainSummary}`);
  if (sources.engineeringQaSummary) parts.push(`## نتائج Engineering QA\n${sources.engineeringQaSummary}`);
  if (sources.supportSummary) parts.push(`## طلبات الدعم المحلولة\n${sources.supportSummary}`);
  if (sources.monitoringSummary) parts.push(`## حوادث Production المحلولة\n${sources.monitoringSummary}`);
  if (sources.prototypeReviewSummary) parts.push(`## مراجعة النموذج الأولي (Prototype Review)\n${sources.prototypeReviewSummary}`);
  if (sources.brainReviewSummary) parts.push(`## مراجعة Brain التنفيذية (Brain Review)\n${sources.brainReviewSummary}`);
  if (sources.fixPromptSummary) parts.push(`## نتائج جولات إصلاح Production\n${sources.fixPromptSummary}`);

  return `أنت خبير Business/Product Analyst مسؤول عن استخراج معرفة تنظيمية قابلة لإعادة الاستخدام من مشروع انتهى، لتُستخدم في تحسين مشاريع الشركة القادمة.

## مصادر المشروع
${parts.join("\n\n") || "(لا توجد مصادر كافية)"}

## قواعد صارمة
1. استخرج بس المعرفة القابلة للتعميم على مشاريع أخرى مستقبلية — مش تفاصيل خاصة بهذا المشروع/العميل نفسه.
2. ممنوع منعًا باتًا ذكر أي اسم عميل، اسم شركة، بيانات دخول، مفاتيح، أو أي معلومة تجارية حساسة خاصة بهذا المشروع.
3. كل عنصر معرفة لازم يحمل category من القائمة التالية بالظبط: ${KNOWLEDGE_CATEGORIES.join(", ")}.
4. كل عنصر لازم evidence حقيقي (source_type + detail قصير) من المصادر أعلاه — ممنوع أي عنصر بدون دليل.
5. confidence_score (0-100) يعكس مدى وضوح ووثوقية الدليل، مش تخمين عشوائي.
6. لو المصادر غير كافية لأي استنتاج، أرجع مصفوفة knowledge فاضية بدل اختلاق معرفة.
7. استخرج كمان أي "قرارات مهمة" واضحة من المصادر (decisions) — بس لو فيه سبب/نتيجة واضحين، وإلا سيبها فاضية.

## صيغة الرد (JSON فقط، بدون أي نص خارجه)
{
  "knowledge": [
    {
      "category": "...",
      "title": "عنوان قصير للدرس/النمط",
      "content": "شرح تفصيلي قابل لإعادة الاستخدام",
      "confidence_score": 75,
      "evidence": [{ "source_type": "brain", "detail": "..." }]
    }
  ],
  "decisions": [
    {
      "decision_title": "...",
      "question": "ليه اتخذنا القرار ده؟",
      "rationale": "...",
      "outcome": "succeeded" | "failed" | "unknown"
    }
  ]
}`;
}

export interface SimilarProjectKnowledgeInput {
  project_name: string;
  similarity_score: number;
  knowledge_summary: string;
}

/**
 * برومبت التوصيات الذكية — بيتشغّل بس لو فيه مشاريع سابقة مشابهة فعليًا
 * (mechanical candidate: القرار "هل نقترح أصلًا؟" بيتاخد بالكود قبل ما
 * الـ AI يتنادى، مش الـ AI هو اللي بيقرر). ممنوع أي توصية بدون مشروع
 * سابق داعم واضح في supporting_project_ids.
 */
export function buildRecommendationsPrompt(currentProjectSummary: string, similarProjects: SimilarProjectKnowledgeInput[]): string {
  const similarBlock = similarProjects
    .map((p, i) => `### مشروع مشابه #${i} — ${p.project_name} (تشابه ${p.similarity_score}%)\n${p.knowledge_summary}`)
    .join("\n\n");

  return `أنت مستشار منتج خبير. مطلوب منك تقترح توصيات ذكية لمشروع جديد اعتمادًا فقط على مشاريع سابقة مشابهة حقيقية من نفس الشركة.

## المشروع الحالي
${currentProjectSummary}

## مشاريع سابقة مشابهة (الأرقام # هي فهرس المصفوفة، استخدمها في supporting_project_indexes)
${similarBlock}

## قواعد صارمة
1. ممنوع أي توصية بدون استناد واضح لمشروع سابق مذكور أعلاه — استخدم supporting_project_indexes للإشارة لفهرس (فهارس) المشروع الداعم.
2. category لازم تكون واحدة من: ${RECOMMENDATION_CATEGORIES.join(", ")}.
3. confidence_score (0-100) يعكس قوة ووضوح التشابه، مش تخمين.
4. لو مفيش توصية حقيقية مبنية على دليل واضح، أرجع مصفوفة فاضية.

## صيغة الرد (JSON فقط)
{
  "recommendations": [
    {
      "category": "...",
      "recommendation": "...",
      "rationale": "...",
      "confidence_score": 70,
      "supporting_project_indexes": [0]
    }
  ]
}`;
}

/**
 * برومبت اقتراح تحسين برومبت — بيتشغّل بس لو فيه إشارة نتيجة سيئة حقيقية
 * (outcome-signals.ts). الاقتراح للمراجعة اليدوية بس؛ ممنوع أي صياغة
 * توحي بتعديل تلقائي. مفيش قراءة لملف الكود الفعلي وقت التشغيل (بيئة
 * Serverless مش مضمون فيها وصول موثوق لمصدر TypeScript) — بدلًا من كده
 * نديله وصف موجز لغرض البرومبت + سبب الإشارة بس، وهو كافٍ لاقتراح نصي
 * عام يراجعه إنسان يدويًا على الملف الحقيقي.
 */
export function buildPromptImprovementPrompt(promptReference: string, promptPurpose: string, outcomeReason: string): string {
  return `أنت خبير Prompt Engineering. مشروع انتهى وفيه إشارة نتيجة غير مُرضية مرتبطة ببرومبت توليد معيّن.

## البرومبت المعني
مرجع الكود: ${promptReference}
الغرض: ${promptPurpose}

## سبب الإشارة (Outcome Signal)
${outcomeReason}

## المطلوب
اقترح تحسين واحد محدد وقابل للتطبيق يدويًا على هذا البرومبت، مبني على السبب المذكور فقط — ممنوع تخمين أسباب غير مذكورة.

## صيغة الرد (JSON فقط)
{
  "suggestion": "التعديل المقترح تحديدًا",
  "rationale": "لماذا هذا التعديل تحديدًا سيحسّن النتيجة",
  "confidence_score": 60
}`;
}

/**
 * برومبت AI Product Advisor — تحليل استشاري للقراءة فقط قبل اعتماد أي
 * مرحلة، مبني على محتوى المرحلة نفسه (+ أنماط KB لو موجودة). ممنوع
 * اقتراح أي تعديل مباشر — الغرض تقييم بس.
 */
export function buildProductAdvisorPrompt(
  stageName: string,
  contentSummary: string,
  relevantKnowledge: string,
  relevantDecisions: string = ""
): string {
  return `أنت مستشار منتج تقني خبير (Product Advisor). مطلوب منك تحليل استشاري للقراءة فقط قبل اعتماد "${stageName}" — بدون اقتراح تعديل مباشر على المحتوى نفسه.

## محتوى المرحلة
${contentSummary}

## أنماط معرفة تنظيمية ذات صلة (لو وُجدت)
${relevantKnowledge || "(لا يوجد)"}

## قرارات سابقة من مشاريع تانية أُرشفت (Decision Memory — لو وُجدت)
استخدمها كسياق تاريخي بس — لو فيه قرار مشابه فشل في مشروع سابق، وضّح ده في risks أو weaknesses.
${relevantDecisions || "(لا يوجد)"}

## المطلوب — تحليل بالأبعاد التالية بس، كل بُعد قائمة نقاط قصيرة
- strengths: نقاط قوة واضحة
- weaknesses: نقاط ضعف واضحة
- missing_opportunities: فرص لم تُستغل
- risks: مخاطر محتملة
- scalability_notes: ملاحظات قابلية التوسع
- maintainability_notes: ملاحظات قابلية الصيانة
- business_impact: الأثر على العمل (نص قصير)
- technical_impact: الأثر التقني (نص قصير)

## صيغة الرد (JSON فقط)
{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "missing_opportunities": ["..."],
  "risks": ["..."],
  "scalability_notes": ["..."],
  "maintainability_notes": ["..."],
  "business_impact": "...",
  "technical_impact": "..."
}`;
}
