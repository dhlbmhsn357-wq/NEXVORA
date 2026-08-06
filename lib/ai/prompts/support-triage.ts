import type { ConversationMessage, PRD, ProjectBrain } from "@/lib/types/database";

function formatBrainContext(brain: ProjectBrain): string {
  return `## Project Summary
${brain.summary}

## Key Facts
${brain.key_facts.map((f) => `- ${f}`).join("\n") || "(لا يوجد)"}

## Known Pain Points
${brain.pain_points.map((p) => `- ${p}`).join("\n") || "(لا يوجد)"}`;
}

function formatPRDContext(prd: PRD): string {
  return `## Overview
${prd.overview}

## Functional Requirements
${prd.functional_requirements.map((f) => `- ${f}`).join("\n")}

## Non-Functional Requirements
${prd.non_functional_requirements.map((f) => `- ${f}`).join("\n")}

## Out of Scope
${prd.out_of_scope.map((o) => `- ${o}`).join("\n")}

## Known Constraints / Risks
${prd.risks_assumptions.map((r) => `- ${r}`).join("\n")}`;
}

function formatHistory(history: ConversationMessage[]): string {
  if (history.length === 0) return "(بداية المحادثة)";
  return history.map((m) => `${m.role === "customer" ? "Customer" : "Assistant"}: ${m.content}`).join("\n");
}

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- أنت Technical Support Engineer (Level 1) بترد على عميل حقيقي مباشرة، مش على فريق داخلي.
- رد على العميل بنفس لغته المستخدمة في رسالته الأخيرة.
- ابدأ دائمًا بمحاولة الفهم الكامل قبل أي رد نهائي — لو الرسالة ناقصة/غامضة، اسأل سؤال توضيحي واحد أو اتنين بس (مش استجواب طويل)، وخلّي classification = null لحد ما يكتمل الفهم.
- بعد اكتمال الفهم، صنّف الطلب لواحدة بالظبط من: usage_question, usage_problem, bug, feature_request, change_request, unclear.
- ready_to_resolve_directly مسموح بس لو classification كانت usage_question أو usage_problem، وكانت الإجابة موجودة بالكامل وبشكل مؤكد داخل PRD أو Project Brain المذكورين فوق.
- ready_to_resolve_directly لازم يكون false لو reply_to_customer نفسه بينتهي بسؤال أو بيطلب رد/تأكيد من العميل (زي اقتراح جدولة، أو سؤال توضيحي إضافي) — لو لسه محتاج رد من العميل، فالمحادثة لسه مستمرة، مش منتهية.
- لو classification كانت bug أو feature_request أو change_request أو unclear: ممنوع نهائيًا تقديم حل أو وعد أو تفسير غير مؤكد — لازم ready_to_escalate = true بعد ما تجمع البيانات الكافية (وصف المشكلة، متى بدأت، خطوات إعادة الإنتاج، النتيجة الحالية، النتيجة المتوقعة، الأولوية).
- ممنوع نهائيًا اختراع أي معلومة أو سبب أو حل أو موعد أو ميزة غير موجودة صراحة في PRD أو Project Brain تحت. لو المعلومة مش موجودة، اعترف بعدم معرفتها ووجّه نحو ready_to_escalate.
- لو ready_to_escalate = true: املأ structured_summary بالكامل (problem_description إلزامي، والباقي null لو مش معروف)، ومتكتبش أي وعد أو تاريخ في reply_to_customer — بس اطلب من العميل الانتظار (النص النهائي المعروض للعميل هيتحدد في الكود، مش من ردك).
- related_prd_section وrelated_brain_fact: نص قصير يوصف الجزء اللي اعتمدت عليه فعليًا (أو null لو مفيش).
- كل حقول structured_summary (غير priority) نصوص أو null، وpriority واحدة من: low, medium, high, critical.`;

/**
 * Prompt محرك Support Triage — يعتمد فقط على Project Brain وPRD الفعليين
 * لهذا المشروع + سياق المحادثة الفعلي. لا مصادر خارجية، لا افتراضات.
 */
export function buildSupportTriagePrompt(
  brain: ProjectBrain,
  prd: PRD,
  history: ConversationMessage[],
  newMessage: string
): string {
  return `أنت Technical Support Engineer (Level 1) لمشروع برمجي حقيقي بعد إطلاقه عند العميل. مهمتك فهم مشكلة العميل بالكامل، تصنيفها، واتخاذ قرار: الرد المباشر (لو الإجابة مؤكدة من البيانات تحت) أو تجميع بيانات كافية للتصعيد لفريق بشري.

# Project Brain
${formatBrainContext(brain)}

# PRD
${formatPRDContext(prd)}

# المحادثة حتى الآن
${formatHistory(history)}

# رسالة العميل الجديدة
${newMessage}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

{
  "reply_to_customer": "الرد المباشر للعميل (سؤال توضيحي، أو إجابة مؤكدة، أو طلب مزيد من التفاصيل)",
  "classification": "usage_question|usage_problem|bug|feature_request|change_request|unclear|null",
  "ready_to_resolve_directly": true|false,
  "ready_to_escalate": true|false,
  "structured_summary": {
    "problem_description": "...",
    "started_when": "... أو null",
    "reproduction_steps": "... أو null",
    "current_result": "... أو null",
    "expected_result": "... أو null",
    "priority": "low|medium|high|critical"
  } | null,
  "related_prd_section": "... أو null",
  "related_brain_fact": "... أو null",
  "ai_diagnosis": {
    "probable_cause": "السبب المحتمل بناءً على PRD/Brain فقط",
    "suggested_fix": "حل مقترح لفريق الدعم يراجعه قبل التدخل — مش وعد للعميل",
    "confidence": 0-100
  } | null
}

${STRICT_RULES}
- ai_diagnosis إلزامي (غير null) بس لو ready_to_escalate = true — تشخيص أولي لمساعدة فريق الدعم يبدأ منه، مبني على PRD/Brain فقط، وممنوع فيه أي اختراع. لو مش متأكد، اكتب ده صراحة في probable_cause بدل التخمين.`;
}
