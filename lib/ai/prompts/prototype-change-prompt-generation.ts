import type { ChangeRequestRow, ChangeImpactRow } from "@/lib/sector-standards/change-request-types";

/**
 * Prompt توليد "Prototype Change Prompt" (المرحلة ج) — يبني نص عملي
 * ومختصر يُلصق مباشرة في أداة Prototype خارجية (Google Stitch/Figma
 * Make/Codex/Claude Code/Bolt). عكس standard-change-impact-analysis.ts
 * (تحليل يرجّع JSON مهيكل غني)، هنا المخرج الحقيقي المطلوب نص Prompt
 * واحد — بس بنغلّفه في مفتاح JSON واحد {"prompt_text": "..."} (نفس نمط
 * buildPrototypePromptSectionRegenerationPrompt) عشان الـ parsing يبقى
 * موثوق زي باقي مهام النظام، مش استخراج نص حر من رد النموذج.
 *
 * **الضمانة الأساسية**: المدخل الوحيد المسموح هنا هو change_impacts
 * بحالة 'applied' فعليًا لطلب التغيير ده — ممنوع النموذج يخترع تغييرات
 * تانية أو يقترح Features غير مذكورة في الأثر المُطبَّق.
 */

const CHANGE_REQUEST_TYPE_LABELS: Record<string, string> = {
  add: "إضافة",
  modify: "تعديل",
  remove: "حذف",
};

const IMPACT_TYPE_LABELS: Record<string, string> = {
  add: "إضافة",
  modify: "تعديل",
  remove: "حذف",
};

function formatAppliedImpact(impact: ChangeImpactRow, index: number): string {
  const typeLabel = IMPACT_TYPE_LABELS[impact.impactType] ?? impact.impactType;
  const changeJson = JSON.stringify(impact.proposedChange ?? {}, null, 2);
  return [
    `### أثر ${index + 1}`,
    `- artifact_type: ${impact.artifactType}`,
    `- artifact_label: ${impact.artifactLabel || "(بدون تسمية)"}`,
    `- نوع الأثر: ${typeLabel}`,
    impact.artifactId ? `- artifact_id الحالي: ${impact.artifactId}` : "- artifact_id: (عنصر جديد، لا يوجد بعد)",
    `- السبب: ${impact.reason || "(بدون سبب مسجَّل)"}`,
    `- التغيير المُطبَّق فعليًا (proposed_change كما اتطبّق):`,
    "```json",
    changeJson,
    "```",
  ].join("\n");
}

/**
 * يبني الـ prompt الكامل لمهمة PROTOTYPE_CHANGE_PROMPT_GENERATION.
 *
 * `appliedImpacts` لازم تكون فقط عناصر change_impacts بحالة 'applied'
 * لطلب التغيير ده — التصفية دي مسؤولية الطبقة المستدعية
 * (prototype-prompt-service.ts)، مش هنا.
 */
export function buildPrototypeChangePromptGenerationPrompt(
  changeRequest: ChangeRequestRow,
  appliedImpacts: ChangeImpactRow[],
  prototypeTool: string | null
): string {
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[changeRequest.type] ?? changeRequest.type;
  const toolLine = prototypeTool
    ? `أداة الـ Prototype المستهدفة (تلميح المستخدم): ${prototypeTool}`
    : "أداة الـ Prototype المستهدفة: غير محددة — اكتب Prompt عام يصلح لأي أداة Coding/Prototype تفاعلية شائعة (Google Stitch, Figma Make, Codex, Claude Code, Bolt).";

  const impactsBlock = appliedImpacts.map(formatAppliedImpact).join("\n\n");

  return `أنت مساعد بتجهّز Prompt عملي ومختصر يُستخدم مباشرة داخل أداة Prototype/Coding خارجية (زي Google Stitch أو Figma Make أو Codex أو Claude Code أو Bolt) عشان تعكس تغيير واحد صغير ومحدَّد على Prototype قائم بالفعل — مش تعيد بناء الـ Prototype من الصفر.

## القواعد الصارمة (Zero-Invention + Scope Discipline)
- اكتب Prompt يصف **فقط** التغييرات المُطبَّقة فعليًا المذكورة تحت — ممنوع تخترع أو تقترح أي تعديل، شاشة، أو Feature مش مذكور صراحةً في قائمة الأثر المُطبَّق.
- الـ Prompt الناتج لازم يوضّح صراحةً لأداة الـ Prototype إنها تحافظ على **كل حاجة تانية زي ما هي**: التدفقات الحالية، نظام التصميم (Design System) الحالي، اتجاه RTL، وكل الشاشات غير المرتبطة بالتغيير ده.
- امنع صراحةً في نص الـ Prompt نفسه إضافة أي Feature غير مذكورة في التغيير المطلوب — الأداة المستهدفة أحيانًا "بتتحمّس" وتضيف حاجات زيادة، والـ Prompt لازم يمنع ده بوضوح.
- كن ملموسًا ومباشرًا بما يكفي إن الـ Prompt يتنفَّذ فورًا بدون أي تفسير أو سؤال إضافي — اذكر أسماء الحقول/الشاشات/الحالات كما وردت في التغيير المُطبَّق بالضبط.
- الـ Prompt نفسه لازم يكون بالإنجليزية بالكامل (موجّه لأداة برمجية، مش لعرض على مستخدم عربي) — حتى لو باقي هذا الطلب معاك بالعربي.

## طلب التغيير الأصلي (للسياق فقط — مش المصدر المباشر لمحتوى الـ Prompt)
- النوع: ${typeLabel}
- العنوان: ${changeRequest.title}
- الوصف: ${changeRequest.description || "(بدون وصف إضافي)"}

## الأثر المُطبَّق فعليًا على بيانات المنتج (المصدر الوحيد المسموح لمحتوى الـ Prompt)
${impactsBlock}

## ${toolLine}

## المطلوب منك بالضبط
أرجع **JSON فقط** بمفتاح واحد بالضبط (لا شرح، لا مقدمة، لا Markdown code fences حوالين الـ JSON نفسه):

{ "prompt_text": "..." }

قواعد صارمة على الرد:
- "prompt_text" نص واحد بالإنجليزية، بصيغة Markdown لو احتاج (عناوين فرعية، Bullet points)، جاهز للصق المباشر في أداة الـ Prototype.
- لازم يتضمّن بوضوح: (1) وصف التغيير المطلوب بدقة، (2) تعليمات صريحة بالحفاظ على كل حاجة تانية (تدفقات/تصميم/RTL/شاشات غير مرتبطة)، (3) منع صريح لإضافة أي حاجة زيادة غير مذكورة.
- ممنوع أي مفتاح إضافي في الـ JSON غير "prompt_text".`;
}
