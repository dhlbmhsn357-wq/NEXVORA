import type { ContextItem } from "@/lib/ai/prompt-framework";

export interface IncidentContextInput {
  title: string;
  description: string;
  category: string;
  severity: string;
  root_cause: string;
  affected_components: string[];
  workaround: string;
  permanent_solution: string;
  patch_proposal: string;
}

/** Persona الخاص بـ Claude Architect (يُمرّر للـ Prompt Framework). */
export const PRODUCTION_FIX_PERSONA =
  "أنت Claude Architect — مش بتصلح الكود بنفسك، بتكتب أفضل Prompt (أو مجموعة Prompts) لمطوّر (أو Claude Code/Cursor/Codex) يقدر ينفّذ بيها الإصلاح مباشرة.";

/**
 * كتل سياق الحادثة للـ Context Engine — الـ Framework بيطبّعها ويحسب
 * الجاهزية عليها (incident / evidence / constraints).
 */
export function buildProductionFixContextItems(incident: IncidentContextInput): ContextItem[] {
  return [
    {
      key: "incident",
      title: "الحادثة المطلوب حلها",
      content: [
        `- العنوان: ${incident.title}`,
        `- الوصف: ${incident.description}`,
        `- الفئة: ${incident.category} — الخطورة: ${incident.severity}`,
        `- السبب الجذري: ${incident.root_cause}`,
      ].join("\n"),
      source: { type: "incident", ref: null },
    },
    {
      key: "evidence",
      title: "أدلة وحلول مقترحة",
      content: [
        incident.patch_proposal ? `- اقتراح إصلاح أولي: ${incident.patch_proposal}` : "",
        incident.workaround ? `- حل مؤقت مقترح: ${incident.workaround}` : "",
        incident.permanent_solution ? `- حل دائم مقترح: ${incident.permanent_solution}` : "",
      ].filter(Boolean).join("\n"),
    },
    {
      key: "constraints",
      title: "المكوّنات المتأثرة",
      content: incident.affected_components.length > 0 ? incident.affected_components.join("، ") : "",
    },
  ];
}

/** نص المرحلة (المطلوب + الـ Schema + القواعد الخاصة) — بلا Persona/سياق (بيجوا من الـ Framework). */
export function buildProductionFixStageBody(): string {
  return `## المطلوب منك بالضبط
لو المشكلة صغيرة ومحصورة في محور واحد، أرجع Prompt واحد بس. لو المشكلة كبيرة وبتمس أكتر من محور (مثلاً قاعدة بيانات + واجهة أمامية + API)، قسّمها لعدة Prompts، كل واحد بمحوره — ورتّبهم بالـ dependencies الصحيحة (مثلاً الـ database لازم يتنفذ قبل الـ api اللي بيعتمد عليه).

أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "prompts": [${PROMPT_SCHEMA}]
}

قواعد صارمة:
- لا تخترع ملفات أو مسارات غير منطقية — اذكر بس تخمينات معقولة بناءً على المكوّنات المتأثرة المذكورة فوق.
- كل Prompt لازم يكون منفّذ بشكل مستقل قدر الإمكان، مع dependencies واضحة لو محتاج prompt تاني قبله.
- 1-6 Prompts بالحد الأقصى — لو محتاجة أكتر من كده، يبقى المشكلة كبيرة جدًا وتحتاج مراجعة بشرية أولاً بدل التقسيم الآلي.
- كل النصوص بالعربية الفصحى الاحترافية، إلا أسماء الملفات/الحقول التقنية.`;
}

const PROMPT_SCHEMA = `{
  "area": "database" | "frontend" | "api" | "worker" | "tests" | "deployment" | "other",
  "title": "عنوان قصير للمهمة",
  "context": "السياق الكامل اللي محتاجه المطوّر عشان يفهم المشكلة",
  "problem": "شرح دقيق للمشكلة المطلوب حلها في هذا الجزء بس",
  "evidence": "الدليل الداعم (من تحليل الحادثة فوق)",
  "expected_result": "النتيجة المتوقعة بعد التنفيذ",
  "acceptance_criteria": ["معيار قبول قابل للتحقق"],
  "files": ["مسار ملف متوقع يحتاج تعديل — تخمين منطقي بناءً على المكوّنات المتأثرة، مش اختراع"],
  "dependencies": ["area من الـ Prompts التانية لازم تتنفذ قبل ده، أو فاضية"],
  "priority": "critical" | "high" | "medium" | "low",
  "risks": "مخاطر التنفيذ",
  "testing_plan": "خطة اختبار عملية للتأكد من الحل",
  "rollback": "خطة تراجع لو الحل فشل"
}`;

/**
 * Claude Architect — بيحوّل حادثة واحدة (بعد تحليل AI في
 * production-monitoring.ts) لمجموعة Prompts جاهزة للمطوّر، مقسّمة حسب
 * المحور التقني لو المشكلة كبيرة. منفصل تمامًا عن fix-prompt الخاص
 * بحلقة إصلاح Engineering QA (code-execution.ts) — نطاق مختلف، صفر تداخل.
 */
export function buildProductionFixPromptGenerationPrompt(incident: IncidentContextInput): string {
  return `أنت Claude Architect — مش بتصلح الكود بنفسك، بتكتب أفضل Prompt (أو مجموعة Prompts) لمطوّر (أو Claude Code/Cursor/Codex) يقدر ينفّذ بيها الإصلاح مباشرة.

## الحادثة المطلوب حلها
- العنوان: ${incident.title}
- الوصف: ${incident.description}
- الفئة: ${incident.category} — الخطورة: ${incident.severity}
- السبب الجذري: ${incident.root_cause}
- المكوّنات المتأثرة: ${incident.affected_components.join("، ") || "غير محدّدة"}
- حل مؤقت مقترح: ${incident.workaround || "لا يوجد"}
- حل دائم مقترح: ${incident.permanent_solution || "لا يوجد"}
- اقتراح إصلاح أولي: ${incident.patch_proposal || "لا يوجد"}

## المطلوب منك بالضبط
لو المشكلة صغيرة ومحصورة في محور واحد، أرجع Prompt واحد بس. لو المشكلة كبيرة وبتمس أكتر من محور (مثلاً قاعدة بيانات + واجهة أمامية + API)، قسّمها لعدة Prompts، كل واحد بمحوره — ورتّبهم بالـ dependencies الصحيحة (مثلاً الـ database لازم يتنفذ قبل الـ api اللي بيعتمد عليه).

أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "prompts": [${PROMPT_SCHEMA}]
}

قواعد صارمة:
- لا تخترع ملفات أو مسارات غير منطقية — اذكر بس تخمينات معقولة بناءً على المكوّنات المتأثرة المذكورة فوق.
- كل Prompt لازم يكون منفّذ بشكل مستقل قدر الإمكان، مع dependencies واضحة لو محتاج prompt تاني قبله.
- 1-6 Prompts بالحد الأقصى — لو محتاجة أكتر من كده، يبقى المشكلة كبيرة جدًا وتحتاج مراجعة بشرية أولاً بدل التقسيم الآلي.
- كل النصوص بالعربية الفصحى الاحترافية، إلا أسماء الملفات/الحقول التقنية.`;
}
