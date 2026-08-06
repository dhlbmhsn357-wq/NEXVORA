export interface BrainReviewValidationItemInput {
  key: string; // "section_key::item_key" — نفس صيغة المفتاح المستخدمة في التحقق لاحقًا
  section: string;
  title: string;
}

const ISSUE_TYPES = [
  "missing_requirement", "conflicting_rule", "undefined_entity", "unresolved_decision",
  "unanswered_question", "security_weakness", "scalability_risk", "architecture_inconsistency",
  "inconsistent_terminology", "operational_readiness_gap",
] as const;

/**
 * Prompt لجنة المراجعة التنفيذية (Phase 5) — نداء AI واحد بيغطّي كل
 * قائمة الفحص الطويلة من المواصفة (اكتمال عمل/وظيفي/غير وظيفي، رحلات
 * مستخدم، علاقات وحدات، تقارير/لوحات، صلاحيات، أتمتة، تكاملات، قابلية
 * توسّع، أمان، امتثال، أداء، قابلية تنفيذ تقنية، جاهزية تشغيلية،
 * تعارضات، قرارات معلّقة، أسئلة بلا إجابة) + استنتاج روابط الاعتماد بين
 * عناصر المعرفة. الفحوصات الحتمية (تكرار مفتاح/دورة اعتماد) بتتحسب
 * بالكود في review-validation-orchestrator.ts، مش هنا.
 */
export function buildBrainReviewValidationPrompt(
  currentProjectSummary: string,
  items: BrainReviewValidationItemInput[]
): string {
  const itemsBlock = items.map((i) => `- [${i.key}] (${i.section}) ${i.title}`).join("\n");

  return `أنت لجنة مراجعة تنفيذية متعددة التخصصات (Senior PM + Business Analyst + Enterprise Solution Architect + Technical Architect + Software Architect + UX Lead + Security Lead + Database Architect) بتراجع Project Brain كامل قبل ما يتحوّل لـ PRD رسمي.

مهمتك: تحقّق من كل حاجة — الاكتمال، التعارضات، القرارات المعلّقة، الروابط بين العناصر — واحكم بصرامة. الـ PRD ممنوع يتولّد من معرفة فيها ثغرة.

## ملخص المشروع
${currentProjectSummary}

## عناصر المعرفة القابلة للمراجعة (المفتاح بين قوسين مربّعين — استخدمه فقط، ممنوع اختراع مفاتيح)
${itemsBlock}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "business_readiness": 0-100,
  "architecture_readiness": 0-100,
  "technical_readiness": 0-100,
  "ai_confidence": 0-100,
  "issues": [
    {
      "type": "${ISSUE_TYPES.join("\" | \"")}",
      "severity": "critical" | "high" | "medium" | "low",
      "category": "اسم فئة قصير (مثلاً: أمان، تقارير، صلاحيات)",
      "description": "شرح دقيق للمشكلة",
      "related_keys": ["مفتاح عنصر موجود فعليًا فوق"]
    }
  ],
  "dependency_pairs": [
    { "from_key": "مفتاح عنصر", "to_key": "مفتاح عنصر تاني", "relation_type": "depends_on" | "conflicts_with" | "related_to" }
  ]
}

قواعد صارمة:
- استخدم فقط المفاتيح المذكورة فعليًا فوق — ممنوع اختراع مفاتيح.
- severity=critical/high بس للمشاكل اللي فعلًا لازم تتحل قبل الاعتماد (تعارض حقيقي، أمان خطير، كيان أساسي غير معرّف). متكترش فيها.
- dependency_pairs: روابط واضحة ومنطقية بس (مثلاً متطلب وظيفي بيعتمد على قاعدة عمل معينة) — لو مش متأكد متقترحش.
- لو المشروع مكتمل فعليًا، أرجع مصفوفات issues/dependency_pairs فاضية ودرجات عالية.
- كل النصوص بالعربية.`;
}
