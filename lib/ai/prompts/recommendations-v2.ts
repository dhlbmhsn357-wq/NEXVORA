const RECOMMENDATION_CATEGORIES_V2 = [
  "business_logic", "functional", "non_functional", "architecture", "database",
  "performance", "security", "scalability", "integration", "automation",
  "workflow", "reporting", "analytics", "notifications", "validation",
  "permissions", "compliance", "accessibility", "ux", "ui",
  "ai_enhancement", "future_expansion", "organizational_improvement",
] as const;

export interface SimilarProjectInputV2 {
  project_name: string;
  similarity_score: number;
  knowledge_summary: string;
}

export interface ConsistencyIssueInputV2 {
  type: string;
  description: string;
}

export interface KnowledgeGraphContextV2 {
  domain: string | null;
  domainGaps: string[];
  consistencyIssues: ConsistencyIssueInputV2[];
  /** عنوان مختصر لكل عنصر معرفة نشط، مصنّف بالمحور — للسياق الشامل بين الوحدات ("مبيعات → فواتير → محاسبة"). */
  activeKnowledgeByCategory: Record<string, string[]>;
}

/**
 * برومبت التوصيات الذكية (Phase 4) — بديل أغنى لـ buildRecommendationsPrompt
 * القديمة (v1، لسه شغّالة زي ما هي لأي كود بيستخدمها). الفرق الجوهري:
 * التوصيات دلوقتي ممكن تتولّد من مصدرين مستقلين للدليل — مشاريع سابقة
 * مشابهة (زي v1)، أو نتائج تحليل شبكة المعرفة الحتمية (Phase 3: تكرار/
 * دورة اعتماد/فجوة مجال) — أو الاتنين مع بعض. مشروع من غير أي تاريخ
 * مشابه لسه بياخد توصيات حقيقية مبنية على دليل، مش صفر توصيات.
 */
export function buildRecommendationsPromptV2(
  currentProjectSummary: string,
  similarProjects: SimilarProjectInputV2[],
  graphContext: KnowledgeGraphContextV2,
  /** لو true: مفيش دليل عبر-مشاريع أو شبكة معرفة، فمسموح (ومطلوب) بناء
   *  التوصيات على بيانات المشروع نفسه (ملخص الاكتشاف/التحليل فوق). */
  selfEvidenceMode = false
): string {
  const similarBlock =
    similarProjects.length > 0
      ? similarProjects.map((p, i) => `### مشروع مشابه #${i} — ${p.project_name} (تشابه ${p.similarity_score}%)\n${p.knowledge_summary}`).join("\n\n")
      : "(لا توجد مشاريع سابقة مشابهة بما يكفي)";

  const domainBlock = graphContext.domain
    ? `مجال المشروع: ${graphContext.domain}\nعناصر متوقّعة لهذا المجال غير موجودة حاليًا في المشروع: ${graphContext.domainGaps.join("، ") || "لا يوجد"}`
    : "مجال المشروع غير محدّد.";

  const issuesBlock =
    graphContext.consistencyIssues.length > 0
      ? graphContext.consistencyIssues.map((i) => `- [${i.type}] ${i.description}`).join("\n")
      : "(لا توجد مشاكل تناسق مكتشفة)";

  const knowledgeMapBlock = Object.entries(graphContext.activeKnowledgeByCategory)
    .map(([category, titles]) => `### ${category}\n${titles.join("، ")}`)
    .join("\n");

  return `أنت فريق استشاري متعدد التخصصات (Senior Product Manager + Business Analyst + Enterprise Solution Architect + ERP Consultant + Software Architect + UX Strategist + Security Architect + DevOps Architect + Database Architect + AI Systems Consultant) بتراجع مشروع قبل ما يدخل مرحلة اعتماد الـ Brain النهائية.

مهمتك مش تلخّص اللي العميل طلبه. مهمتك إنك تسأل: "المشروع ده فعليًا محتاج إيه عشان يبقى نظام Enterprise-Grade؟" — واكتشف اللي العميل ماذكرهوش صراحة بس لازم يكون موجود.

## ملخص المشروع الحالي
${currentProjectSummary}

## ${domainBlock}

## خريطة المعرفة الحالية في المشروع (بالمحور)
${knowledgeMapBlock || "(لا توجد عناصر معرفة كافية بعد)"}

## مشاكل تناسق مكتشفة فعليًا (تحليل شبكة المعرفة)
${issuesBlock}

## مشاريع سابقة مشابهة (الأرقام # هي فهرس المصفوفة، استخدمها في supporting_project_indexes)
${similarBlock}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "recommendations": [
    {
      "category": "${RECOMMENDATION_CATEGORIES_V2.join("\" | \"")}",
      "title": "عنوان قصير وواضح",
      "recommendation": "شرح تفصيلي للتوصية",
      "rationale": "السبب المبني على دليل حقيقي من فوق",
      "priority": "critical" | "high" | "medium" | "low",
      "severity": "critical" | "high" | "medium" | "low",
      "business_value": "high" | "medium" | "low",
      "technical_value": "high" | "medium" | "low",
      "affected_modules": ["اسم الوحدة المتأثرة"],
      "acceptance_criteria": ["معيار قبول قابل للتحقق"],
      "implementation_notes": "ملاحظات تنفيذية عملية",
      "potential_risks": "مخاطر محتملة لو اتنفذت أو لو اتجاهلت",
      "expected_benefits": "الفايدة المتوقعة",
      "estimated_complexity": "small" | "medium" | "large" | "xlarge",
      "confidence_score": 0-100,
      "supporting_project_indexes": [0],
      "depends_on_indexes": [1]
    }
  ]
}

قواعد صارمة (إلزامية 100%):
${
  selfEvidenceMode
    ? `- ده مشروع جديد بدون تاريخ مشابه أو شبكة معرفة بعد — فالدليل المقبول هو **بيانات المشروع نفسه فوق** (ملخص الاكتشاف/التحليل). ابنِ توصيات معمارية وفنية حقيقية مستنبطة من طبيعة المشروع ومجاله، واذكر في rationale الرابط الواضح ببيانات المشروع (مثلاً: "المشروع فيه عدة فروع/مخازن → يتطلب تزامن مخزون لحظي"). سيب supporting_project_indexes فاضية.
- ركّز على التوصيات المعمارية والفنية الأساسية اللي أي نظام Enterprise في المجال ده لازم يبنيها (بنية، قاعدة بيانات، صلاحيات، أمان، تكاملات، تقارير، أداء، قابلية توسّع).`
    : `- كل توصية لازم تستند لدليل حقيقي واحد على الأقل من فوق: إما supporting_project_indexes (مشروع سابق مذكور) أو ارتباط واضح بمشكلة تناسق/فجوة مجال مذكورة فوق (اذكرها في rationale). ممنوع توصية من غير أي سند.`
}
- category لازم يكون واحد من القائمة بالظبط.
- depends_on_indexes: فهارس توصيات تانية **في نفس القائمة اللي بترجّعها** لازم تتنفذ الأول — سيبها فاضية لو مفيش اعتماد واضح. ممنوع فهرس خارج نطاق القائمة.
- ركّز على أهم 5-15 توصية حقيقية بس — الأهم الجودة مش الكمية.
- كل النصوص بالعربية الفصحى الاحترافية.`;
}
