/**
 * Prompt الطبقة الاستشارية — «المستشار الأول».
 *
 * ده مش استخراج ولا تصنيف. ده **تفكير استشاري** فوق المعرفة المهيكلة
 * المستخرَجة بالفعل. النموذج بياخد صورة كاملة للمشروع (كيانات، قواعد،
 * سير عمل، متطلبات، قرارات، مخاطر، تعارضات، فجوات، قدرات ناقصة محسوبة
 * حتميًا) ويرجّع رؤى استشارية بمستوى Senior Consultant.
 *
 * الفارق عن التوصيات القائمة (`recommendations-v2`): تلك تشتغل على
 * Brain المعتمَد + مشاريع مشابهة؛ دي تشتغل على **معرفة مركز المعرفة
 * الخام** وتغطّي محاور أوسع (معماري، عمليات، تحسين، تنبّؤ بالمخاطر) قبل
 * ما توصل الـ Brain.
 */

const SCHEMA_TEMPLATE = `{
  "insights": [
    {
      "insight_type": "architecture | business_process | optimization | risk_prediction | recommendation | opportunity",
      "title": "عنوان قصير حاسم للرأي",
      "detail": "شرح الرأي كاملًا ومفهومًا بمفرده",
      "rationale": "لماذا هذا الرأي؟ ما الدليل من المعرفة أدناه؟",
      "impact": "ماذا يحدث إن نُفّذ، وماذا يحدث إن أُهمل؟",
      "module": "الوحدة/المجال المعني، أو null",
      "severity": "critical | high | medium | low | info",
      "effort": 40,
      "confidence": 80,
      "source_refs": [
        { "type": "requirement | risk | decision | workflow | rule | entity | conflict | gap", "quote": "اقتباس أو إشارة للمعرفة التي بُني عليها الرأي" }
      ]
    }
  ]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، بلا أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- كل رأي **لازم** يكون له rationale و impact و source_refs غير فارغة. الرأي بلا أساس من المعرفة أدناه = تخمين، لا تُخرجه.
- **لا تعِد اكتشاف القدرات الناقصة** — القائمة المحسوبة حتميًا أدناه («قدرات ناقصة مكتشفة») مضمونة بالفعل في النظام؛ ركّز على رؤى **تحليلية** لا يستطيع فحص القوائم اكتشافها: أنماط معمارية، أعناق زجاجة في العمليات، مخاطر متوقَّعة، فرص تحسين.
- **business_process**: ابحث في سير العمل عن خطوات يدوية، موافقات ناقصة، خطوات مكرّرة، أعناق زجاجة.
- **architecture**: اقترح حدود وحدات، نمط تصميم، استراتيجية تكامل/طابور/أحداث — مبنية على الكيانات وعلاقاتها الفعلية.
- **risk_prediction**: توقّع مخاطر **لم تُذكر صراحة** لكنها منطقية (قابلية توسّع، أداء، دَين تقني) بناءً على البنية.
- effort و confidence أرقام صحيحة ٠–١٠٠. effort = جهد التنفيذ التقديري.
- لا تكرّر نفس الرأي بصياغتين. رأي واحد قوي أفضل من ثلاثة ضعيفة.
- إن كانت المعرفة ضئيلة جدًا لرأي مؤسَّس، أرجع مصفوفة insights أقصر — الجودة قبل الكمّ.
- كل النصوص بالعربية عدا المصطلحات التقنية وأسماء الأنظمة.`;

export interface KnowledgeIntelligenceInput {
  projectName: string;
  declaredDomain?: string | null;
  /** ملخّص نصّي للمعرفة المهيكلة (كيانات/قواعد/سير عمل/متطلبات/قرارات/مخاطر). */
  knowledgeSummary: string;
  /** التعارضات المفتوحة — سياق مهم للمستشار. */
  conflictsSummary: string;
  /** الفجوات المفتوحة. */
  gapsSummary: string;
  /** القدرات الناقصة المكتشفة حتميًا — عشان النموذج مايعيدش اكتشافها. */
  missingCapabilities: string[];
  /** الدرجات المحسوبة — تعطي النموذج حسًّا بالنضج الحالي. */
  scoresLine: string;
}

export function buildKnowledgeIntelligencePrompt(input: KnowledgeIntelligenceInput): string {
  const domainLine = input.declaredDomain
    ? `\nالمجال: ${input.declaredDomain}`
    : "";

  const missingLine =
    input.missingCapabilities.length > 0
      ? `\n## قدرات ناقصة مكتشفة (لا تُعِد اكتشافها)\n${input.missingCapabilities.map((m) => `- ${m}`).join("\n")}`
      : "";

  const conflicts = input.conflictsSummary.trim()
    ? `\n## تعارضات مفتوحة\n${input.conflictsSummary}`
    : "";
  const gaps = input.gapsSummary.trim() ? `\n## فجوات مفتوحة\n${input.gapsSummary}` : "";

  return `أنت مستشار أعمال ومعماري نظم أول (Senior Business Consultant & Enterprise Architect) بخبرة عميقة في ERP والعمليات المؤسسية. مهمتك تحليل معرفة المشروع أدناه وإنتاج **رؤى استشارية** لا مجرد ملخّص.

المشروع: ${input.projectName}${domainLine}
الحالة الحالية: ${input.scoresLine}

## المعرفة المهيكلة
${input.knowledgeSummary}${conflicts}${gaps}${missingLine}

## المطلوب منك بالضبط
فكّر كمستشار يراجع المشروع لأول مرة. أنتج رؤى استشارية مؤسَّسة على المعرفة أعلاه. أرجع **JSON فقط**:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
