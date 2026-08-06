/**
 * Prompt استخراج ذكاء الأعمال المهيكل من نص المعرفة المجمّع.
 *
 * ## الفرق عن تصنيف المعرفة
 *
 * `knowledge-classification` بيحوّل المقطع لعناصر معرفة **حرة** مصنّفة.
 * ده بياخد المعرفة المجمّعة ويستخرج منها **كائنات مهيكلة** بحقول
 * قابلة للاستعلام: كيان له نوع ومفتاح، قاعدة عمل لها شرط ونتيجة، سير
 * عمل له خطوات مرتّبة. الفرق إن ده بيغذّي جداول ٠٠٧٧ المهيكلة لا جدول
 * عناصر حر.
 *
 * الاقتباس الحرفي شرط في كل كائن — نفس مبدأ باقي المنظومة: أي شيء
 * يدخل قاعدة بيانات مهيكلة لازم يكون قابلًا للتتبّع لمصدره.
 */

const SCHEMA_TEMPLATE = `{
  "entities": [
    {
      "entity_type": "company | department | employee | role | customer | supplier | product | service | project | system | policy | ... أو نوع جديد بصيغة snake_case",
      "name": "اسم الكيان كما ورد",
      "description": "وصف موجز لدور الكيان",
      "confidence": 85,
      "quote": "اقتباس حرفي يثبت وجود الكيان"
    }
  ],
  "relations": [
    {
      "from": "اسم كيان مذكور في entities بالضبط",
      "to": "اسم كيان آخر مذكور في entities بالضبط",
      "relation_type": "يملك | يتبع | يوافق_على | يعتمد_على | يزوّد | يدير | ...",
      "confidence": 80
    }
  ],
  "rules": [
    {
      "name": "اسم مختصر للقاعدة",
      "condition": "الشرط: متى تنطبق القاعدة",
      "action": "النتيجة: ماذا يحدث عند تحقّق الشرط",
      "rule_type": "validation | approval | calculation | restriction",
      "scope": "المجال أو الوحدة المتأثرة، أو null",
      "priority": "critical | high | medium | low",
      "confidence": 80,
      "quote": "اقتباس حرفي"
    }
  ],
  "workflows": [
    {
      "name": "اسم سير العمل",
      "description": "وصف موجز",
      "trigger": "ما الذي يبدأ العملية، أو null",
      "outcome": "النتيجة النهائية، أو null",
      "domain": "المجال، أو null",
      "steps": [
        { "name": "اسم الخطوة", "actor": "من ينفّذها أو null", "condition": "شرط اختياري أو null", "is_approval": false }
      ],
      "confidence": 80
    }
  ],
  "requirements": [
    {
      "requirement_type": "functional | non_functional | constraint | assumption | dependency | acceptance_criteria",
      "statement": "نصّ المتطلب واضحًا ومفهومًا بمفرده",
      "rationale": "لماذا هذا المتطلب مهم، أو null",
      "priority": "must | should | could | wont | medium",
      "module": "الوحدة المتأثرة، أو null",
      "confidence": 80,
      "quote": "اقتباس حرفي"
    }
  ],
  "decisions": [
    {
      "decision": "القرار الذي اتُّخذ",
      "rationale": "سبب القرار، أو null",
      "decision_maker": "من اتخذه، أو null",
      "decided_on": "التاريخ كما ورد نصًّا، أو null",
      "impact": "أثر القرار، أو null",
      "affected_modules": ["الوحدات المتأثرة"],
      "confidence": 80,
      "quote": "اقتباس حرفي"
    }
  ],
  "risks": [
    {
      "risk_type": "business | technical | financial | security | operational | legal | architecture",
      "description": "وصف المخاطرة",
      "likelihood": "high | medium | low",
      "severity": "critical | high | medium | low",
      "mitigation": "إجراء التخفيف، أو null",
      "affected_area": "المجال المتأثر، أو null",
      "confidence": 80,
      "quote": "اقتباس حرفي"
    }
  ]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، بلا أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- كل كائن (كيان، قاعدة، متطلب، قرار، مخاطرة) لازم يحمل quote **حرفيًا** موجودًا فعليًا في النص أعلاه. ممنوع تأليف أو إعادة صياغة الاقتباس.
- **العلاقات**: طرفا كل علاقة (from و to) لازم يكونا اسمي كيانين مذكورين في مصفوفة entities بالضبط. ممنوع علاقة لكيان غير مستخرَج، وممنوع علاقة كيان بنفسه.
- **قواعد العمل**: القاعدة لازم يكون لها condition و action منفصلان واضحان. الجملة العامة بلا شرط ونتيجة ليست قاعدة — تجاهلها.
- **سير العمل**: لا تُخرج سير عمل بأقل من خطوتين. الخطوة الواحدة مهمة لا سير عمل. رتّب الخطوات بترتيب حدوثها.
- المعلومة المستنتجة غير المنصوصة: أخرِجها لكن بـ confidence أقل من 60.
- لا تكرّر نفس الكائن في أكثر من مدخل.
- القسم الذي لا معلومات فيه: أرجع مصفوفته فارغة. المصفوفة الفارغة صحيحة ومطلوبة، ليست فشلًا.
- confidence رقم صحيح من 0 إلى 100.
- كل النصوص بالعربية عدا المصطلحات التقنية وأسماء الأنظمة.`;

export interface KnowledgeProcessingInput {
  projectName: string;
  declaredDomain?: string | null;
  /** المعرفة المجمّعة من عناصر Knowledge Hub — النص الذي يُستخرَج منه. */
  knowledgeText: string;
}

export function buildKnowledgeProcessingPrompt(input: KnowledgeProcessingInput): string {
  const domainLine = input.declaredDomain
    ? `\nالمجال المُعلَن: ${input.declaredDomain} — استخدمه للترجيح عند الغموض، لا لفرضه على محتوى واضح أنه من مجال آخر.`
    : "";

  return `أنت محلل أعمال ومعماري نظم خبير. مهمتك استخراج **ذكاء الأعمال المهيكل** من المعرفة المجمّعة للمشروع: الكيانات وعلاقاتها، قواعد العمل، سير العمل، المتطلبات، القرارات، والمخاطر.

المشروع: ${input.projectName}${domainLine}

## المعرفة المجمّعة
${input.knowledgeText}

## المطلوب منك بالضبط
حلّل النص أعلاه واستخرج الكائنات المهيكلة. أرجع **JSON فقط** بهذا الشكل بالظبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
