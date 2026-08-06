import type { BrainSectionKey } from "@/lib/brain-v2/types";

/**
 * Prompt التوليف: تحويل معرفة المستندات لعناصر **جاهزة للـ Brain**.
 *
 * الفرق عن التصنيف (المرحلة الأولى): التصنيف بيشتغل على مقطع واحد
 * وبيوصف اللي مكتوب فيه. التوليف بيشتغل على المعرفة المتراكمة كلها
 * وبيطلّع قواعد عمل وأدوار وسلاسل اعتماد ومعادلات ومؤشرات — يعني
 * الحاجات القابلة للتنفيذ اللي بتدخل المستند فعلًا.
 *
 * الناتج مربوط بأقسام الـ Brain مباشرةً، عشان الدفعة الجاية تقدر تدمجه
 * إضافيًا من غير طبقة ترجمة وسيطة.
 */

/**
 * الأقسام اللي التوليف مسموح يكتب فيها.
 *
 * الملخّص التنفيذي ونموذج العمل مستبعدين عن قصد: دول سرد شامل للمشروع
 * والـ PM هو اللي بيكتبهم، ومستند تشغيلي واحد مش مؤهّل يعيد صياغتهم.
 * وأسئلة الاجتماع مستبعدة لأن التوليف بيستخرج معرفة مثبتة مش أسئلة.
 */
export const SYNTHESIS_TARGET_SECTIONS: BrainSectionKey[] = [
  "business_goals",
  "stakeholders",
  "business_rules",
  "functional_requirements",
  "constraints",
  "assumptions",
  "risks",
  "known_facts",
  "user_roles",
  "suggested_features",
  "suggested_integrations",
  "suggested_kpis",
];

export const SECTION_GUIDANCE: Record<string, string> = {
  business_goals: "هدف عمل قابل للقياس مذكور أو مستنتج بوضوح من المستندات.",
  stakeholders: "جهة أو دور له سلطة أو مصلحة: الاسم في title والدور في detail.",
  business_rules: "قاعدة إلزامية: حدود، شروط، سلاسل اعتماد، معادلات حساب، استثناءات.",
  functional_requirements: "قدرة يجب أن يوفّرها النظام، مصاغة كجملة واحدة قابلة للاختبار.",
  constraints: "قيد قانوني أو تقني أو زمني أو مالي يحدّ من الحلول الممكنة.",
  assumptions: "افتراض تعتمد عليه المستندات دون إثبات صريح.",
  risks: "خطر واقعي مع سببه كما يظهر من المستندات.",
  known_facts: "حقيقة مثبتة عن الوضع الحالي: أرقام، أنظمة قائمة، أحجام، دورات عمل.",
  user_roles: "دور مستخدم داخل النظام مع مسؤولياته.",
  suggested_features: "قدرة مقترحة تحل مشكلة ظاهرة في المستندات.",
  suggested_integrations: "تكامل مع نظام خارجي مذكور في المستندات.",
  suggested_kpis: "مؤشر أداء قابل للقياس مذكور أو مشتق من أهداف المستندات.",
};

const SCHEMA_TEMPLATE = `{
  "proposals": [
    {
      "section": "أحد أقسام الـ Brain المذكورة تحت",
      "title": "الجملة الأساسية — مختصرة ودقيقة",
      "detail": "التفصيل: الشرط، الرقم، السبب، أو المسؤولية. اتركه فارغًا إذا كان العنوان كافيًا",
      "priority": "high أو medium أو low",
      "confidence": 85,
      "source_refs": ["I3", "I7"]
    }
  ],
  "operational": [
    {
      "kind": "approval_chain أو calculation أو exception أو scenario أو automation",
      "title": "اسم مختصر",
      "detail": "الوصف الكامل: خطوات السلسلة، أو المعادلة، أو شرط الاستثناء، أو خطوات السيناريو",
      "source_refs": ["I5"]
    }
  ]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- كل مقترح لازم يكون له source_refs بمعرّفات من القائمة فوق. المقترح بلا مرجع يعتبر مؤلَّفًا ويُرفض.
- ممنوع اختراع معرّف مش في القائمة.
- **ممنوع إعادة صياغة عنصر معرفة كما هو**. المطلوب توليف: تحويل الوصف لقاعدة أو متطلب أو دور قابل للتنفيذ. لو العنصر مالوش مقابل تنفيذي، سيبه.
- ممنوع تقترح شيئًا موجودًا بالفعل في قائمة "ما هو مسجَّل في Project Brain" تحت، ولا صياغة أخرى له.
- section لازم يكون واحدًا من الأقسام المذكورة بالظبط.
- title جملة واحدة مفهومة بمفردها. ممنوع "كما ورد أعلاه" أو "حسب الجدول السابق".
- operational للبنى التشغيلية اللي مالهاش قسم مباشر في الـ Brain: سلاسل الاعتماد، معادلات الحساب، الاستثناءات، السيناريوهات، فرص الأتمتة. لو مفيش، رجّع مصفوفة فاضية.
- confidence رقم صحيح من 0 لـ 100. أقل من 60 للمستنتَج، أعلى من 80 للمنصوص.
- لو مفيش مقترحات حقيقية، رجّع مصفوفات فاضية — ده رد صحيح ومطلوب.
- كل النصوص بالعربية ما عدا المصطلحات التقنية وأسماء الأنظمة.`;

export interface SynthesisItemRef {
  ref: string;
  category: string;
  title: string;
  content: string;
}

export interface KnowledgeSynthesisInput {
  projectName: string;
  items: SynthesisItemRef[];
  /** ما هو مسجَّل بالفعل في الـ Brain — لمنع اقتراح المكرّر. */
  existingBrainStatements: string[];
}

export function buildKnowledgeSynthesisPrompt(input: KnowledgeSynthesisInput): string {
  const itemsBlock = input.items
    .map((item) => `[${item.ref}] (${item.category}) ${item.title}\n${item.content}`)
    .join("\n\n");

  const existingBlock =
    input.existingBrainStatements.length > 0
      ? input.existingBrainStatements.map((s) => `- ${s}`).join("\n")
      : "لا يوجد محتوى مسجَّل بعد — كل ما تستخرجه سيكون جديدًا.";

  const sectionsBlock = SYNTHESIS_TARGET_SECTIONS.map(
    (key) => `- ${key}: ${SECTION_GUIDANCE[key]}`
  ).join("\n");

  return `أنت محلل أعمال أول. عندك معرفة مستخرجة من مستندات مشروع "${input.projectName}"، والمطلوب تحويلها لعناصر قابلة للتنفيذ تدخل وثيقة معرفة المشروع.

## المعرفة المستخرجة من المستندات
${itemsBlock}

## ما هو مسجَّل بالفعل في Project Brain
ممنوع تقترح أيًا من دول أو صياغة أخرى له.

${existingBlock}

## أقسام Project Brain المتاحة
${sectionsBlock}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالظبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
