import type { PRD } from "@/lib/types/database";
import type { BrainSectionKey } from "@/lib/brain-v2/types";
import { BRAIN_SECTION_LABELS } from "@/lib/brain-v2/types";

/**
 * Prompt توليد **قسم PRD مخصّص لزيادة واحدة**.
 *
 * الفرق الجوهري عن `buildPRDGenerationPrompt`: ده مش بيعيد كتابة المستند.
 * بياخد المستند القائم كـ **سياق للقراءة فقط**، وياخد "دلتا الزيادة"
 * (العناصر اللي اتضافت للـ Brain من الاجتماع/الجلسة/القرار الجديد)،
 * ويرجّع قسم واحد بيوصف الجزء الجديد بس وأثره على القائم.
 *
 * ده اللي بيمنع إن اجتماع واحد جديد يخلّي كل الـ PRD يتعاد توليده.
 */

const SCHEMA_TEMPLATE = `{
  "summary": "فقرة واحدة تشرح إيه اللي أضافته الزيادة دي للمنتج",
  "scope_added": ["ما الذي دخل النطاق بسبب هذه الزيادة"],
  "functional_requirements": ["متطلب وظيفي جديد ناتج عن هذه الزيادة فقط"],
  "non_functional_requirements": ["متطلب غير وظيفي جديد ناتج عن هذه الزيادة فقط"],
  "user_stories": [{ "role": "بصفتي ...", "want": "أريد ...", "benefit": "حتى ..." }],
  "acceptance_criteria": [{ "given": "بافتراض ...", "when": "عندما ...", "then": "فإن ..." }],
  "impact_on_existing": ["أثر محدد على جزء قائم في المستند، مع ذكر اسم القسم المتأثر"],
  "risks_assumptions": ["مخاطرة أو افتراض خاص بهذه الزيادة"],
  "test_focus": ["ما الذي يجب اختباره تحديدًا للتحقق من هذه الزيادة"]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- المحتوى لازم يخص **الزيادة الجديدة بس**. ممنوع تعيد صياغة أو تكرار متطلبات موجودة أصلًا في المستند القائم.
- المستند القائم فوق للقراءة فقط — مش مطلوب منك تعدّله ولا تقترح إعادة كتابته.
- لو الزيادة بتتعارض مع حاجة موجودة في المستند القائم، اذكر ده في impact_on_existing بوضوح مع اسم القسم، من غير ما تحاول تصلّحه بنفسك — القرار ده للـ PM.
- ممنوع اختراع متطلبات مش مستنبطة من دلتا الزيادة المذكورة تحت.
- test_focus لازم يكون قابل للتنفيذ: كل عنصر بيوصف حالة اختبار محددة، مش هدف عام.
- كل عنصر في acceptance_criteria لازم يكون بصيغة Given/When/Then بالحقول الثلاثة بالظبط.
- لو الدلتا مش كفاية لقسم معين، رجّع مصفوفة فاضية له بدل ما تخترع محتوى.
- كل النصوص بالعربية.`;

/** يلخّص المستند القائم في صورة مضغوطة — عناوين المتطلبات بس، مش المستند كله. */
function summarizeExistingPrd(prd: PRD): string {
  const lines: string[] = [];
  lines.push(`النظرة العامة: ${prd.overview || "غير محدد"}`);
  lines.push(`المشكلة: ${prd.problem_statement || "غير محدد"}`);
  if (prd.goals?.length) lines.push(`الأهداف القائمة:\n- ${prd.goals.join("\n- ")}`);
  if (prd.functional_requirements?.length) {
    lines.push(`المتطلبات الوظيفية القائمة:\n- ${prd.functional_requirements.join("\n- ")}`);
  }
  if (prd.non_functional_requirements?.length) {
    lines.push(
      `المتطلبات غير الوظيفية القائمة:\n- ${prd.non_functional_requirements.join("\n- ")}`
    );
  }
  if (prd.out_of_scope?.length) lines.push(`خارج النطاق:\n- ${prd.out_of_scope.join("\n- ")}`);
  return lines.join("\n\n");
}

/** يحوّل دلتا الزيادة لنص مقروء بأسماء الأقسام العربية. */
export function formatIncrementDelta(
  delta: Partial<Record<BrainSectionKey, unknown[]>>
): string {
  const blocks: string[] = [];
  for (const [key, items] of Object.entries(delta)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    const label = BRAIN_SECTION_LABELS[key as BrainSectionKey] ?? key;
    const rendered = items
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .map((line) => `- ${line}`)
      .join("\n");
    blocks.push(`### ${label}\n${rendered}`);
  }
  return blocks.length > 0 ? blocks.join("\n\n") : "لا توجد عناصر جديدة.";
}

export interface PrdIncrementPromptInput {
  projectName: string;
  incrementTitle: string;
  incrementSummary: string;
  sourceLabel: string;
  delta: Partial<Record<BrainSectionKey, unknown[]>>;
  existingPrd: PRD;
}

export function buildPrdIncrementPrompt(input: PrdIncrementPromptInput): string {
  return `أنت Product Manager محترف. المشروع "${input.projectName}" عنده Product Requirements Document معتمد بالفعل. وصلت معلومة جديدة، والمطلوب منك **قسم إضافي واحد** يوصف الجزء الجديد ده — مش إعادة كتابة المستند.

## المستند القائم (للقراءة فقط — ممنوع تعديله)
${summarizeExistingPrd(input.existingPrd)}

## الزيادة الجديدة
العنوان: ${input.incrementTitle}
المصدر: ${input.sourceLabel}
الملخّص: ${input.incrementSummary}

### العناصر الجديدة اللي دخلت Project Brain
${formatIncrementDelta(input.delta)}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالظبط (بدون أي مفتاح إضافي أو مفقود):

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}
