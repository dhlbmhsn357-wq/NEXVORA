import type { ChangeRequestRow } from "@/lib/sector-standards/change-request-types";

/**
 * Prompt تحليل أثر طلب تغيير (المرحلة ب) — نفس انضباط Zero-Invention
 * المُتبَع في project-assistant-qa.ts بالضبط: النموذج يحلّل **فقط** ضد
 * بيانات المنتج الفعلية المُمرَّرة، ممنوع يخترع Artifacts غير موجودة،
 * وممنوع يكتب نتيجة نثرية — لازم مقترح تعديل مهيكل (proposed_change)
 * لكل عنصر متأثر عشان خطوة "تحديث الأقسام المتأثرة فقط" تقدر تستهلكه
 * برمجيًا بدل ما تفسّر نص حر.
 */

const CHANGE_REQUEST_TYPE_LABELS: Record<string, string> = {
  add: "إضافة",
  modify: "تعديل",
  remove: "حذف",
};

const SCHEMA_TEMPLATE = `{
  "impacts": [
    {
      "artifact_type": "requirement | user_story | acceptance_criteria | business_rule | system_message | persona | user_flow | state_machine | prd_section | decision",
      "artifact_id": "<id حرفي من قائمة البيانات الحالية تحت — أو null فقط لو impact_type=\\"add\\">",
      "artifact_label": "تسمية معروضة قصيرة (مثال: \\"REQ-12\\"، \\"US-19\\"، \\"PRD §6.3\\")",
      "impact_type": "add | modify | remove",
      "reason": "سبب واضح ومبني على بيانات المشروع الفعلية ليه العنصر ده متأثر",
      "proposed_change": { "...حقول محددة تتغير + قيمها الجديدة، حسب artifact_type..." },
      "dependencies": ["وصف نصي لأي تعارض/اعتمادية مع أثر آخر في نفس التحليل"],
      "missing_information": "لو التغيير غامض جدًا لدرجة إنه مش قابل للحسم الكامل، وضّح هنا بالظبط الناقص — وإلا سيبها فاضية"
    }
  ]
}`;

/**
 * يبني الـ prompt الكامل لمهمة STANDARD_CHANGE_IMPACT_ANALYSIS.
 *
 * `currentProductContext` سياق جاهز بالكامل من impact-analysis-pipeline.ts
 * (تنسيق موحّد لكل نطاقات بيانات المنتج الحالية — Personas/Flows/
 * Requirements/Stories/AC/Business Rules/System Messages/State Machines/
 * PRD/Decisions) — نفس فكرة "السياق جاهز، الـ prompt مسؤوليته يخلي
 * النموذج يحترمه" المُتبَعة في project-assistant-qa.ts.
 */
export function buildImpactAnalysisPrompt(
  changeRequest: ChangeRequestRow,
  currentProductContext: string
): string {
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[changeRequest.type] ?? changeRequest.type;

  return `أنت محلّل أثر تغييرات منتج لمشروع "Client Variant" مبني على Sector Standard مُستنسَخ مسبقًا.

## القواعد الصارمة (Zero-Invention)
- حلّل طلب التغيير **فقط** ضد بيانات المنتج الحالية المقدَّمة تحت — ممنوع تفترض وجود عناصر منتج غير مذكورة فيها.
- أي "artifact_id" تذكره في الرد لازم يكون معرّفًا **حرفيًا** ظهر في قائمة البيانات الحالية تحت — الاستثناء الوحيد: impact_type="add" (عنصر جديد مقترح لسه معندوش id حقيقي)، وفي هذه الحالة اجعل artifact_id = null بالضبط.
- لا تكتفِ بوصف نثري للتعديل — proposed_change لازم يكون كائن JSON مهيكل بحقول محددة وقيمها الجديدة (زي {"title": "...", "priority": "must"})، لأن هذا الحقل سيُستهلك برمجيًا مباشرة لتحديث قاعدة البيانات، وليس للعرض على إنسان فقط.
- لو طلب التغيير غامض جدًا في نقطة معيّنة (مش واضح مين الـ persona المقصودة، مش محدد threshold الرقم الجديد...) وضّح هذا **صراحة** في missing_information لعنصر الأثر المتعلّق، بدل ما تخترع قيمة معقولة من عندك.
- لو التغيير المطلوب فعليًا **مالوش أي أثر حقيقي** على أي عنصر من العناصر المقدَّمة تحت (نادر لكن ممكن)، أرجع impacts=[] بدل ما تختلق أثرًا وهميًا.
- اذكر أي تعارض أو اعتمادية حقيقية اكتشفتها بين عنصرين متأثرين في هذا التحليل نفسه في حقل dependencies.

## طلب التغيير المطلوب تحليل أثره
- النوع: ${typeLabel}
- العنوان: ${changeRequest.title}
- الوصف: ${changeRequest.description || "(بدون وصف إضافي)"}

## بيانات المنتج الحالية لهذا المشروع (المصدر الوحيد المسموح للتحليل)
${currentProductContext}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط (لا شرح، لا مقدمة، لا Markdown code fences):

${SCHEMA_TEMPLATE}

قواعد صارمة على الرد:
- "impacts" مصفوفة (ممكن تكون فاضية [] لو فعلًا مفيش أثر حقيقي).
- "artifact_type" لازم يكون بالظبط واحدة من القيم المذكورة في السكيمة فوق.
- "impact_type" لازم يكون بالظبط واحدة من: "add"، "modify"، "remove".
- "artifact_id": نص id حرفي من البيانات الحالية تحت، أو null حصريًا مع impact_type="add".
- ممنوع أي مفتاح إضافي أو مفقود عن الحقول المذكورة بالضبط لكل عنصر أثر.`;
}
