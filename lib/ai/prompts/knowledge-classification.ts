/**
 * Prompt تصنيف واستخراج المعرفة من مقطع مستند واحد.
 *
 * الفكرة: كل مقطع بيتحوّل لعناصر معرفة مصنّفة، كل عنصر بيحمل اقتباسه
 * الحرفي من المستند. الاقتباس مش رفاهية — هو اللي بيخلّي أي شيء يدخل
 * الـ Project Brain بعد كده قابل للتتبّع لمصدره، وهو نفس المبدأ المطبّق
 * في تحليل الاكتشاف والاجتماعات.
 */

/**
 * التصنيفات المقترحة. النموذج مسموح له يقترح تصنيفًا خارجها لو المحتوى
 * يستدعي ده — المواصفة بتقول "وأي تصنيف جديد"، وقفل القايمة كان هيجبر
 * معرفة حقيقية تتحشر في خانة غلط.
 */
export const KNOWLEDGE_CATEGORIES = [
  "business",
  "workflow",
  "departments",
  "users",
  "permissions",
  "erp_modules",
  "sales",
  "accounting",
  "hr",
  "inventory",
  "manufacturing",
  "crm",
  "finance",
  "logistics",
  "legal",
  "compliance",
  "operations",
  "terminology",
  "integrations",
  "risks",
  "business_rules",
  "pain_points",
  "requirements",
  "technical_constraints",
  "business_opportunities",
  "unknown_items",
  "missing_information",
  "decision_candidates",
  "dependencies",
  "best_practices",
  "competitive_insights",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number] | (string & {});

export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  business: "الأعمال",
  workflow: "سير العمل",
  departments: "الأقسام",
  users: "المستخدمون",
  permissions: "الصلاحيات",
  erp_modules: "وحدات ERP",
  sales: "المبيعات",
  accounting: "المحاسبة",
  hr: "الموارد البشرية",
  inventory: "المخزون",
  manufacturing: "التصنيع",
  crm: "علاقات العملاء",
  finance: "المالية",
  logistics: "اللوجستيات",
  legal: "الشؤون القانونية",
  compliance: "الامتثال",
  operations: "العمليات",
  terminology: "المصطلحات",
  integrations: "التكاملات",
  risks: "المخاطر",
  business_rules: "قواعد العمل",
  pain_points: "نقاط الألم",
  requirements: "المتطلبات",
  technical_constraints: "القيود التقنية",
  business_opportunities: "فرص العمل",
  unknown_items: "بنود غير واضحة",
  missing_information: "معلومات ناقصة",
  decision_candidates: "قرارات مرشّحة",
  dependencies: "الاعتماديات",
  best_practices: "أفضل الممارسات",
  competitive_insights: "رؤى تنافسية",
};

export function categoryLabel(category: string): string {
  return KNOWLEDGE_CATEGORY_LABELS[category] ?? category;
}

const SCHEMA_TEMPLATE = `{
  "document_summary": "سطران على الأكثر: هذا المقطع عن ماذا",
  "language": "ar أو en أو mixed",
  "items": [
    {
      "category": "أحد التصنيفات المذكورة، أو تصنيف جديد بصيغة snake_case إذا لم يناسب أي منها",
      "title": "عنوان قصير ودقيق للمعلومة",
      "content": "صياغة المعلومة كاملة وواضحة بحيث تُفهم بمفردها بدون الرجوع للمستند",
      "confidence": 85,
      "quote": "اقتباس حرفي من نص المقطع يثبت هذه المعلومة",
      "tags": ["وسم قصير"]
    }
  ],
  "gaps": [
    {
      "description": "معلومة ناقصة أو غامضة في هذا المقطع",
      "why_it_matters": "لماذا نقصها يؤثر على المشروع",
      "needed_from": "client أو meeting أو research أو management أو engineering",
      "priority": "high أو medium أو low"
    }
  ]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- كل عنصر في items لازم يكون له quote **حرفي** موجود فعليًا في نص المقطع فوق. ممنوع تأليف اقتباس أو إعادة صياغته.
- لو المعلومة مستنتجة مش منصوصة، اكتبها لكن خلّي confidence أقل من 60 ووضّح في content إنها استنتاج.
- content لازم يكون مفهومًا بمفرده. ممنوع صياغة زي "كما هو مذكور أعلاه" أو "حسب الجدول السابق".
- ممنوع تكرار نفس المعلومة في أكتر من عنصر.
- المقطع اللي مفيهوش معرفة مفيدة (فهرس، ترويسة، صفحة غلاف، أرقام صفحات) رجّع له items فاضية — ده صحيح ومطلوب، مش فشل.
- gaps للنواقص الحقيقية بس. لو المقطع مكتمل رجّع مصفوفة فاضية.
- confidence رقم صحيح من 0 لـ 100.
- كل النصوص بالعربية ما عدا المصطلحات التقنية وأسماء الأنظمة.`;

export interface KnowledgeClassificationInput {
  projectName: string;
  /** المجال اللي المستخدم أعلنه وقت الرفع — بيوجّه التصنيف لو موجود. */
  declaredDomain?: string | null;
  sourceTitle: string;
  /** موضع المقطع في المستند: مسار العناوين، الصفحة، ورقة العمل. */
  locatorLabel: string;
  chunkIndex: number;
  chunkCount: number;
  /** نص المقطع. فاضي لو الملف بيتقرأ بالنموذج مباشرةً (PDF، صورة، صوت). */
  chunkText: string;
  /** صحيح لما المحتوى جاي كملف مرفق للنموذج بدل نص. */
  isMediaSource: boolean;
}

export function buildKnowledgeClassificationPrompt(input: KnowledgeClassificationInput): string {
  const domainLine = input.declaredDomain
    ? `\nالمجال المُعلَن من الفريق: ${input.declaredDomain} — استخدمه للترجيح عند الغموض، لكن لا تفرضه على محتوى واضح أنه من مجال آخر.`
    : "";

  const body = input.isMediaSource
    ? `المحتوى مرفق كملف مع هذه الرسالة (مستند أو صورة أو تسجيل). اقرأه بالكامل: النصوص، الجداول، المخططات، التسميات داخل الصور، والكلام المنطوق إن وُجد.`
    : `## نص المقطع\n${input.chunkText}`;

  const position = input.isMediaSource
    ? `الملف بالكامل`
    : `المقطع ${input.chunkIndex + 1} من ${input.chunkCount} — الموضع: ${input.locatorLabel}`;

  return `أنت محلل أعمال متخصص في استخراج المعرفة المؤسسية من وثائق الشركات: السياسات، إجراءات التشغيل، الأدلة، الدراسات، المخططات، والتشريعات.

المشروع: ${input.projectName}
المصدر: ${input.sourceTitle}
الموضع: ${position}${domainLine}

${body}

## المطلوب منك بالضبط
حوّل المحتوى ده لعناصر معرفة مصنّفة. أرجع **JSON فقط** بالشكل التالي بالظبط:

${SCHEMA_TEMPLATE}

## التصنيفات المتاحة
${KNOWLEDGE_CATEGORIES.join("، ")}

${STRICT_RULES}`;
}
