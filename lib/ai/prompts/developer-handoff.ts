import type { GapReport, PRD } from "@/lib/types/database";
import type { BrainContent } from "@/lib/brain-v2/types";
import { formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";

function formatPRDContext(prd: PRD): string {
  return `## Overview
${prd.overview}

## Functional Requirements
${prd.functional_requirements.map((f) => `- ${f}`).join("\n")}

## Non-Functional Requirements
${prd.non_functional_requirements.map((f) => `- ${f}`).join("\n")}

## Risks & Assumptions
${prd.risks_assumptions.map((r) => `- ${r}`).join("\n")}`;
}

function formatReviewContext(review: GapReport, completionPercentage: number, overallStatus: string): string {
  return `## Overall Status
${overallStatus} (${completionPercentage}% complete)

## Missing Features
${review.missing_features.map((f) => `- ${f}`).join("\n") || "(لا يوجد)"}

## Scope Creep
${review.scope_creep.map((f) => `- ${f}`).join("\n") || "(لا يوجد)"}

## Non-Functional Gaps
${review.non_functional_gaps.map((f) => `- ${f}`).join("\n") || "(لا يوجد)"}

## Unresolved Risks
${review.unresolved_risks.map((f) => `- ${f}`).join("\n") || "(لا يوجد)"}

## Recommendation Summary (من آخر مراجعة)
${review.recommendation_summary}`;
}

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- أنت بتخاطب Reviewer (مراجع كود/QA/Security/Performance/Architecture) هيراجع كود مبني بالفعل — مش Developer هيبني حاجة جديدة.
- ممنوع نهائيًا شرح كيفية بناء أي Feature، أو كتابة أي خطوات تنفيذ/برمجة.
- ممنوع اختراع أي معلومة غير موجودة في البيانات المذكورة فوق (Project Brain / PRD / آخر Prototype Review) — لا بيانات وهمية إطلاقًا.
- setup_steps: خطوات تشغيل محلية عامة ومنطقية بناءً على السياق التقني في الـ PRD فقط (بدون قراءة كود فعلي) — لو مفيش معلومة كافية، رجّع مصفوفة فيها عنصر واحد بس يوضح إن الخطوات محتاجة إضافة يدوية.
- review_focus_areas: رتّب حسب الأولوية (high/medium/low) بناءً فقط على Missing Features وUnresolved Risks وNon-Functional Gaps المذكورين فوق ومخاطر PRD.
- review_acceptance_criteria: معايير واضحة وقابلة للتحقق لمتى نعتبر عملية المراجعة دي مكتملة (زي: كل الـ High priority areas اتراجعت، كل الـ Critical/High bugs اتسجلت، إلخ).
- كل النصوص بالإنجليزية.`;

/**
 * Prompt توليد حزمة Developer Handoff — يعتمد فقط على Project Brain وPRD
 * وآخر Prototype Review (بدون أي مصدر تاني، بدون قراءة الكود الفعلي
 * من GitHub في هذه المرحلة). يرجّع 4 حقول فقط تحتاج حكم/تركيب — باقي
 * أقسام الحزمة بتتبني في الكود مباشرة (deterministic.ts / fixed-sections.ts).
 */
export function buildDeveloperHandoffGenerationPrompt(
  brain: BrainContent,
  prd: PRD,
  review: { gap_report: GapReport; completion_percentage: number; overall_status: string }
): string {
  return `أنت Senior Technical Writer بتجهّز حزمة مراجعة (Developer Review Handoff Package) موجّهة لفريق Code Review / QA / Security Review / Performance Review / Architecture Validation قبل التسليم النهائي للعميل. البناء خلص بالفعل — مهمتك توثيق حالة المشروع للمراجعة، مش شرح كيفية البناء.

# Project Brain
${formatBrainV2ForPrompt(brain)}

# PRD
${formatPRDContext(prd)}

# آخر Prototype Review (Gap Report)
${formatReviewContext(review.gap_report, review.completion_percentage, review.overall_status)}

## المطلوب منك بالضبط
أرجع **JSON فقط** بـ 4 مفاتيح بالضبط:

{
  "project_overview": "ملخص مختصر وموجّه للمراجع عن طبيعة المشروع وهدفه (فقرة أو فقرتين)",
  "setup_steps": ["خطوة تشغيل محلي 1", "خطوة 2", "..."],
  "review_focus_areas": [
    { "area": "اسم مجال المراجعة", "priority": "high|medium|low", "reason": "سبب الأولوية مبني على البيانات فوق" }
  ],
  "review_acceptance_criteria": ["معيار اكتمال المراجعة 1", "معيار 2", "..."]
}

${STRICT_RULES}`;
}
