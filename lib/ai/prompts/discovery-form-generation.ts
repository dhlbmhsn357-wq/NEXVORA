import type {
  DiscoveryCompanySize,
  DiscoveryComplexity,
  DiscoveryDepth,
  DiscoveryGenerationInput,
} from "@/lib/types/database";

/** إصدار الـ Prompt — يُحفظ في القالب المولّد (prompt_version) للتتبّع. */
export const DISCOVERY_FORM_PROMPT_VERSION = "v1";

/** الأنواع المسموحة للأسئلة المُولَّدة — لازم يلتزم بها الـ AI حرفيًا. */
export const ALLOWED_QUESTION_TYPES = [
  "short_text",
  "long_text",
  "yes_no",
  "multiple_choice",
  "checkbox",
  "multi_select",
  "rating",
  "number",
  "currency",
  "website",
  "email",
  "phone",
  "date",
  "time",
  "file_upload",
  "logo_upload",
  "document_upload",
] as const;

const DEPTH_GUIDANCE: Record<DiscoveryDepth, { label: string; sections: string; questions: string }> = {
  quick: { label: "اكتشاف سريع", sections: "3 إلى 5 أقسام", questions: "8 إلى 14 سؤالًا إجمالًا" },
  standard: { label: "اكتشاف قياسي", sections: "5 إلى 8 أقسام", questions: "15 إلى 25 سؤالًا إجمالًا" },
  deep: { label: "اكتشاف عميق", sections: "8 إلى 12 قسمًا", questions: "25 إلى 40 سؤالًا إجمالًا" },
  enterprise_audit: { label: "تدقيق مؤسسي", sections: "12 إلى 18 قسمًا", questions: "40 إلى 60 سؤالًا إجمالًا" },
};

const SIZE_LABELS: Record<DiscoveryCompanySize, string> = {
  startup: "شركة ناشئة (Startup)",
  sme: "شركة صغيرة/متوسطة (SME)",
  enterprise: "مؤسسة كبيرة (Enterprise)",
  government: "جهة حكومية (Government)",
};

const COMPLEXITY_LABELS: Record<DiscoveryComplexity, string> = {
  simple: "بسيط",
  medium: "متوسط",
  large: "كبير",
  enterprise: "مؤسسي",
};

/**
 * Prompt مولّد فورم الاكتشاف — يفكّر كفريق كامل (Senior PM + Business
 * Analyst + Enterprise Solution Architect + مستشار ERP + مستشار تحوّل
 * رقمي + Requirements Engineer). ينتج فورمًا مخصصًا 100% للمشروع (مش
 * قالب عام مكرر)، بأسئلة تُظهر فهمًا عميقًا لمجال العميل، مع منطق شرطي
 * حقيقي. قواعد صارمة ضد العمومية، JSON فقط بمخطط ثابت.
 */
export function buildDiscoveryFormGenerationPrompt(
  input: DiscoveryGenerationInput,
  knowledgeContext: string | null
): string {
  const depth = DEPTH_GUIDANCE[input.depth];

  // كتلة التحسين/إعادة التوليد — لو المستخدم طلب تعديلات على نموذج سابق،
  // نمرّر أسئلة النموذج السابق + التعليمات المطلوبة، ونأمر النموذج بأن
  // يبني نسخة محسّنة (يحافظ على الأسئلة الجيدة، يطبّق الإضافات/التعديلات).
  const refinement = input.refinement?.trim();
  const refinementBlock =
    refinement && refinement.length > 0
      ? `\n## وضع التحسين (Refinement) — هذا إعادة توليد لنموذج سابق\n` +
        `النموذج الحالي يحتوي على الأسئلة التالية:\n` +
        `${(input.previousQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join("\n") || "(غير متاح)"}\n\n` +
        `التعديلات/الإضافات المطلوبة من مدير المنتج (طبّقها بدقة):\n${refinement}\n\n` +
        `قواعد التحسين:\n` +
        `- احتفظ بالأسئلة الجيدة والملائمة من النموذج السابق (أعد صياغتها لو لزم).\n` +
        `- طبّق كل التعديلات/الإضافات المطلوبة أعلاه بدقة (أضف/احذف/عدّل حسب الطلب).\n` +
        `- الناتج نموذج **كامل ومتكامل** (مش دلتا) — كل الأسئلة النهائية في JSON واحد.\n` +
        `- حافظ على التخصيص العميق للمجال وعلى عمق الاكتشاف المطلوب.\n`
      : "";

  const knowledgeBlock =
    knowledgeContext && knowledgeContext.trim().length > 0
      ? `\n## معرفة تنظيمية من مشاريع سابقة في نفس المجال (استرشد بها، لكن لا تنسخها حرفيًا — الفورم لازم يفضل مخصصًا لهذا العميل بالذات)\n${knowledgeContext}\n`
      : "";

  return `أنت فريق استشاري كامل داخل PM Operating System — تفكّر في نفس الوقت كـ:
- Senior Product Manager
- Senior Business Analyst
- Enterprise Solution Architect
- مستشار ERP / تحوّل رقمي
- Requirements Engineer + UX Researcher

مهمتك: توليد "نموذج اكتشاف" (Discovery Form) احترافي بمستوى مؤسسي، مخصص 100% لهذا العميل بالتحديد، بحيث يقدر مدير المنتج يبعته للعميل مباشرة بأقل تعديل ممكن.

## قواعد صارمة (إجبارية — أي مخالفة = نتيجة مرفوضة)
1. الفورم لازم يكون مخصصًا للمشروع الموصوف تحت — ممنوع أسئلة عامة تصلح لأي مشروع. كل سؤال لازم يُظهر فهمًا حقيقيًا لمجال العميل وعملياته.
2. مثال على الفرق: مشروع ERP تصنيع لازم يسأل عن "إزاي بتتبّع المواد الخام؟"، "مين بيعتمد أوامر الشراء؟"، "إزاي بتتزامن المخازن؟" — بينما منصة تعليمية لازم تسأل عن "إزاي بيتسجّل الطلاب؟"، "إزاي بيتوزّع المعلمون؟"، "إزاي بتتابع الحضور؟". لا تعطِ فورمًا عامًا أبدًا.
3. استخدم أنواع الأسئلة المناسبة لكل سؤال من القائمة المسموحة فقط (تحت). لا تخترع أنواعًا.
4. ولّد منطقًا شرطيًا (conditional) حيثما كان منطقيًا: لو فيه فروع متعددة → اسأل أسئلة إدارة الفروع، لو فيه مخزون → اسأل أسئلة المخازن، لو فيه مدفوعات → اسأل أسئلة المحاسبة، لو فيه موظفون → اسأل أسئلة الموارد البشرية، لو تطبيق موبايل → اسأل أسئلة الموبايل. السؤال الشرطي يعتمد فقط على سؤال **سابق** له في الترتيب.
5. رتّب الأسئلة في أقسام منطقية (كل قسم = category). ابدأ بالعام ثم تعمّق.
6. التزم بعمق الاكتشاف المطلوب: ${depth.label} — استهدف ${depth.sections} و${depth.questions}.
7. كل سؤال لازم يكون واضحًا، محددًا، وقابلًا للإجابة من العميل مباشرة (لا مصطلحات تقنية داخلية).
8. لا تكرّر نفس السؤال بصياغات مختلفة.
9. أرجع JSON فقط، بدون Markdown، بدون code fences، بدون أي شرح قبله أو بعده.

## بيانات المشروع (المصدر الوحيد المسموح)
- وصف نشاط العميل: ${input.businessDescription}
- أهداف العميل: ${input.clientGoals?.trim() || "غير محددة"}
- مزايا معروفة مطلوبة: ${input.knownFeatures?.trim() || "غير محددة"}
- المجال (Industry/Domain): ${input.industryDomain}
- حجم الشركة: ${SIZE_LABELS[input.companySize]}
- درجة التعقيد: ${COMPLEXITY_LABELS[input.complexity]}
- عمق الاكتشاف المطلوب: ${depth.label}
${refinementBlock}${knowledgeBlock}
## أنواع الأسئلة المسموحة (استخدم القيمة حرفيًا في حقل type)
${ALLOWED_QUESTION_TYPES.join(", ")}
- multiple_choice / checkbox / multi_select: لازم تكون معهم options (مصفوفة نصوص غير فارغة).
- currency: مبلغ مالي. rating: تقييم 1–5. yes_no: نعم/لا (بدون options).
- file_upload / logo_upload / document_upload: طلب رفع ملف.

## عوامل المنطق الشرطي المسموحة (operator)
- "equals": إجابة السؤال المُعتمَد عليه = value
- "not_equals": إجابته ≠ value
- "includes": إجابته (لو متعددة) تحتوي value
- "exists": تمت الإجابة على السؤال المُعتمَد عليه (بأي قيمة) — بدون value
- "not_exists": لم تتم الإجابة عليه

## الـ Schema المطلوب (أرجعه بالضبط)
{
  "template": {
    "name": "اسم مقترح للقالب (مختصر ومهني)",
    "description": "وصف من جملة أو اثنتين لطبيعة هذا الفورم",
    "estimated_project_size": "تقدير حجم المشروع: small | medium | large | enterprise",
    "tags": ["وسم", "وسم"]
  },
  "sections": [
    {
      "title": "عنوان القسم (سيصبح category)",
      "questions": [
        {
          "ref": "معرّف محلي فريد داخل الفورم مثل q1, q2 (تستخدمه في conditional.dependsOnRef)",
          "question": "نص السؤال بالعربية، محدد ومخصص للمجال",
          "description": "شرح قصير اختياري أو null",
          "type": "<نوع من القائمة المسموحة>",
          "required": true,
          "placeholder": "نص مساعد اختياري أو null",
          "options": ["خيار1", "خيار2"],
          "help_text": "تلميح اختياري أو null",
          "conditional": null
        }
      ]
    }
  ]
}

## قواعد تعبئة إضافية
- ref: أعطِ كل سؤال ref فريدًا (q1, q2, q3...) بالترتيب.
- conditional: null للأسئلة الظاهرة دائمًا. للأسئلة الشرطية: { "dependsOnRef": "<ref سؤال سابق>", "operator": "<من القائمة>", "value": <القيمة أو احذفه مع exists/not_exists> }.
- dependsOnRef لازم يشير لسؤال **ظهر قبله** في نفس الفورم — ممنوع الإشارة لسؤال لاحق أو غير موجود.
- options: مصفوفة فارغة [] للأنواع اللي لا تحتاج خيارات.
- كل النصوص بالعربية، عملية، غير عمومية.
- required: خلّي الأساسيات required=true والتفاصيل الثانوية required=false.

أرجع الآن JSON كاملًا بالمخطط أعلاه فقط — لا شيء آخر.`;
}
