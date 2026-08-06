import { PROTOTYPE_PROMPT_SECTION_KEYS, type PrototypePromptSections } from "@/lib/types/database";

function formatPrototypePrompt(sections: PrototypePromptSections): string {
  return PROTOTYPE_PROMPT_SECTION_KEYS.map((key) => `## ${key}\n${sections[key]?.trim() || "(غير محدد)"}`).join("\n\n");
}

/**
 * Prompt تخطيط التنفيذ — Gemini بس (تفكير/تحليل)، بيقسّم Prototype
 * Prompt المعتمد لمهام صغيرة مستقلة قدر الإمكان عشان Claude ينفّذها
 * وحدة-وحدة (بدل ما نبعت المشروع كامل لكل استدعاء — تقليل Token Usage
 * والتكلفة وفرص الـ Hallucination، حسب البرومت الأصلي).
 */
export function buildExecutionPlanPrompt(sections: PrototypePromptSections, repoFileList: string[]): string {
  return `أنت مهندس تخطيط تقني خبير. مطلوب منك تقسيم "Prototype Prompt" المعتمد تحت لخطة تنفيذ — قائمة مهام صغيرة مرتّبة، كل مهمة مستقلة قدر الإمكان عشان تُنفَّذ لوحدها بواسطة نموذج تنفيذ كود منفصل (Claude).

# Prototype Prompt المعتمد
${formatPrototypePrompt(sections)}

# قائمة ملفات الـ Repository الحالية (للسياق بس — عشان تعرف تربط كل مهمة بملفات محتملة)
${repoFileList.length > 0 ? repoFileList.slice(0, 300).join("\n") : "(Repository فارغ أو مشروع جديد)"}

## قواعد تقسيم المهام
- كل مهمة لازم تكون قابلة للتنفيذ لوحدها بدون ما تعتمد على نتيجة مهمة تانية لسه ما اتنفذتش (رتّب المهام بترتيب منطقي: بنية تحتية/Schema أولًا، ثم منطق، ثم واجهات، ثم اختبارات).
- مهمة واحدة = تغيير محدود ومركّز (مثلاً "إنشاء جدول قاعدة بيانات X"، "بناء واجهة API لـ Y"، "إضافة مكوّن واجهة Z") — مش "ابني المشروع كامل".
- target_file_hints: تخمين منطقي لمسارات الملفات المتوقع التعامل معها (بناءً على قائمة الملفات فوق لو موجودة، أو مسار منطقي جديد لو مفيش).
- بين 5 و25 مهمة حسب حجم المتطلبات الفعلي — ممنوع تكرار أو تقسيم مصطنع لمهام تافهة.

## صيغة الرد (JSON فقط، بدون أي شرح أو Markdown)
{
  "tasks": [
    { "title": "عنوان قصير", "description": "وصف تفصيلي واضح لما المطلوب تنفيذه بالظبط", "target_file_hints": ["مسار/ملف.ts"] }
  ]
}`;
}

/**
 * Prompt توليد Fix Prompt — Gemini بيحلّل نتائج فحص QA (Engineering QA
 * أو Accessibility) ويكتب تعليمات إصلاح واضحة ومحدّدة لـ Claude ينفّذها
 * كمهمة تنفيذ جديدة. Gemini هنا بيحلّل بس — مش بيكتب كود، Claude هو اللي هيكتب الكود الفعلي.
 */
export function buildFixPromptGenerationPrompt(
  qaStageLabel: string,
  findingsSummary: string,
  developerHandoffSummary: string | null,
  attemptNumber: number
): string {
  return `أنت مهندس ضمان جودة خبير. فحص "${qaStageLabel}" اكتشف مشاكل بعد تنفيذ الكود — دي المحاولة رقم ${attemptNumber} للإصلاح. مطلوب منك تحليل النتائج وكتابة تعليمات إصلاح واضحة ومحدّدة (Fix Prompt) لنموذج تنفيذ كود (Claude) ينفّذها.

# نتائج الفحص
${findingsSummary}

# سياق إضافي من Developer Handoff (لو موجود)
${developerHandoffSummary ?? "(غير متاح)"}

## المطلوب
اكتب Fix Prompt واحد واضح ومباشر — تعليمات تنفيذية محدّدة (مش وصف عام للمشكلة) توضّح بالظبط إيه اللي لازم يتغيّر ووين، عشان نموذج التنفيذ ينفّذها كمهمة واحدة.

## صيغة الرد (JSON فقط)
{ "fix_prompt": "التعليمات الكاملة هنا", "target_file_hints": ["مسار/ملف.ts"] }`;
}
