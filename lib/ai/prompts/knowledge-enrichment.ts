import { categoryLabel } from "./knowledge-classification";

/**
 * Prompt الإثراء والربط لمجموعة عناصر معرفة داخل تصنيف واحد.
 *
 * المدخل مش كل عناصر المشروع: الطبقة الحتمية (similarity.ts) بتشيل
 * التكرار الواضح الأول وبتختار **الأزواج المرشّحة** بس — المتقاربة بلا
 * تطابق. النموذج بيتسأل عن الحاجات اللي الحساب مايقدرش يحكم فيها:
 * هل ده تعارض؟ اعتمادية؟ تفصيل لنفس القاعدة؟
 *
 * ده اللي بيخلّي التكلفة خطّية مع عدد العناصر بدل ما تبقى تربيعية.
 */

const SCHEMA_TEMPLATE = `{
  "relations": [
    {
      "left_ref": "معرّف العنصر الأول كما ورد في القائمة (مثال: I3)",
      "right_ref": "معرّف العنصر الثاني",
      "type": "supports أو contradicts أو duplicates أو depends_on أو refines أو relates_to",
      "rationale": "جملة واحدة تشرح سبب هذه العلاقة تحديدًا",
      "confidence": 80
    }
  ],
  "conflicts": [
    {
      "left_ref": "معرّف العنصر الأول",
      "right_ref": "معرّف العنصر الثاني",
      "description": "وصف دقيق للتعارض: أي رقم أو قاعدة أو جهة تختلف عن الأخرى",
      "severity": "high أو medium أو low"
    }
  ],
  "glossary": [
    {
      "term": "المصطلح أو الاختصار كما ورد",
      "expansion": "المعنى الكامل أو فك الاختصار",
      "note": "توضيح مختصر عند الحاجة"
    }
  ]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- استخدم معرّفات العناصر (I1، I2، ...) بالظبط كما وردت. ممنوع اختراع معرّف مش في القائمة.
- ممنوع تربط عنصرًا بنفسه.
- **التعارض له معيار واحد**: العنصران يتحدثان عن نفس الشيء ولا يمكن أن يكونا صحيحين معًا (رقمان مختلفان لنفس الحد، جهتان مختلفتان لنفس الاعتماد، شرطان متنافيان لنفس الحالة). الاختلاف في الموضوع أو في السياق **ليس** تعارضًا — "خصم العملاء عشرة" و"خصم الموردين خمسة" قاعدتان مختلفتان لا تتعارضان.
- كل تعارض تذكره لازم يتكرر في relations بنوع contradicts. التعارض بلا علاقة مقابلة يعتبر رد ناقص.
- duplicates للصياغتين اللي بيقولوا نفس المعنى بالظبط. لو فيه أي فرق في الشرط أو الرقم أو النطاق، ده refines مش duplicates.
- depends_on يعني: الأول لا يمكن تطبيقه قبل تحقق الثاني.
- glossary للمصطلحات والاختصارات اللي ظهرت **في نصوص العناصر فقط**. ممنوع تضيف مصطلحات عامة من معرفتك.
- لو مفيش علاقات أو تعارضات أو مصطلحات، رجّع مصفوفات فاضية — ده رد صحيح ومطلوب، مش فشل.
- confidence رقم صحيح من 0 لـ 100.
- كل النصوص بالعربية ما عدا المصطلحات التقنية وأسماء الأنظمة.`;

export interface EnrichmentItemRef {
  /** المعرّف المختصر المستخدم في الـ Prompt (I1، I2، ...). */
  ref: string;
  title: string;
  content: string;
  sourceLabel: string;
}

export interface EnrichmentPairRef {
  leftRef: string;
  rightRef: string;
}

export interface KnowledgeEnrichmentInput {
  projectName: string;
  category: string;
  items: EnrichmentItemRef[];
  /** الأزواج اللي الطبقة الحتمية رشّحتها للفحص. */
  pairs: EnrichmentPairRef[];
}

export function buildKnowledgeEnrichmentPrompt(input: KnowledgeEnrichmentInput): string {
  const itemsBlock = input.items
    .map((item) => `[${item.ref}] ${item.title}\n${item.content}\n(المصدر: ${item.sourceLabel})`)
    .join("\n\n");

  const pairsBlock =
    input.pairs.length > 0
      ? input.pairs.map((p) => `- ${p.leftRef} ↔ ${p.rightRef}`).join("\n")
      : "لا توجد أزواج مرشّحة — افحص القائمة كاملة بحثًا عن علاقات واضحة فقط.";

  return `أنت محلل أعمال يراجع قاعدة معرفة مؤسسية لمشروع "${input.projectName}"، ومهمتك ربط المعلومات ببعضها وكشف ما يتعارض منها.

التصنيف قيد المراجعة: ${categoryLabel(input.category)}

## عناصر المعرفة
${itemsBlock}

## الأزواج المرشّحة للفحص
تحليل أوّلي رشّح الأزواج دي كمتقاربة في المعنى. ابدأ بيها، ومتلزمش تربط كل زوج — لو مفيش علاقة حقيقية سيبه.

${pairsBlock}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالظبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
