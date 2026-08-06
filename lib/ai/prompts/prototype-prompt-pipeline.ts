import type { PRD, PrototypePromptPlanModule } from "@/lib/types/database";
import type { BrainContent } from "@/lib/brain-v2/types";
import { formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import type { PromptTemplate } from "@/lib/prototype-prompt/templates/types";

function formatPRDContext(prd: PRD): string {
  return `## Overview
${prd.overview}

## Problem Statement
${prd.problem_statement}

## Goals
${prd.goals.map((g) => `- ${g}`).join("\n")}

## Functional Requirements
${prd.functional_requirements.map((f) => `- ${f}`).join("\n")}

## Out of Scope
${prd.out_of_scope.map((o) => `- ${o}`).join("\n")}`;
}

/**
 * Prompt مرحلة التخطيط — بيحلل المشروع بالكامل (Brain + PRD) ويطلب من
 * AI يقرر حجم المشروع (small/medium/enterprise) ويقسّمه لموديولات
 * متسلسلة (كل موديول بيعتمد على اللي قبله بشكل أساسي — سلسلة خطية،
 * مش شجرة تعتمديات معقدة).
 */
export function buildExecutionPlanPrompt(
  projectName: string,
  targetTool: PromptTemplate,
  brain: BrainContent,
  prd: PRD
): string {
  return `أنت Principal Software Architect بتحلل مشروع كامل قبل ما تبدأ تكتب أي كود، عشان تبني له خطة تنفيذ مرحلية واضحة تُستخدم لاحقًا لتوليد سلسلة Prompts متتابعة لأداة برمجة بالذكاء الاصطناعي (${targetTool.toolName}).

اسم المشروع: ${projectName}

# Project Brain (المصدر الكامل للحقيقة عن المشروع)
${formatBrainV2ForPrompt(brain)}

# PRD
${formatPRDContext(prd)}

## المطلوب منك بالضبط
1. حدد حجم المشروع الحقيقي بناءً على عدد الميزات والتعقيد الفعلي:
   - "small": مشروع بسيط محدود النطاق → 6 إلى 8 موديولات.
   - "medium": مشروع متوسط بعدة ميزات مترابطة → 10 إلى 12 موديول.
   - "enterprise": مشروع كبير/معقد (زي ERP أو منصة متعددة الأدوار) → 16 إلى 20 موديول.
2. قسّم بناء المشروع لموديولات متسلسلة منطقيًا (أساس البنية أولاً، بعدين الميزات الأساسية، بعدين الميزات المتقدمة، وأخيرًا التلميع/الاختبار). كل موديول لازم يكون قابل للتنفيذ في جلسة واحدة معقولة.
3. كل موديول لازم يعتمد على الموديول اللي قبله في الأغلب (سلسلة خطية) — استخدم depends_on لتوضيح الاعتماديات الفعلية بس (رقم index الموديول أو الموديولات اللي المفروض تخلص الأول).
4. اكتب ملخص تنفيذي عام (execution_summary) يشرح استراتيجية البناء الكاملة في فقرة أو فقرتين.

أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "project_size": "small" | "medium" | "enterprise",
  "execution_summary": "...",
  "modules": [
    { "index": 1, "title": "عنوان الموديول", "summary": "وصف مختصر جدًا (سطر إلى سطرين) لما هيتبني في الموديول ده", "depends_on": [] },
    { "index": 2, "title": "...", "summary": "...", "depends_on": [1] }
  ]
}

قواعد صارمة:
- عدد الموديولات لازم يطابق النطاق المحدد لحجم المشروع اللي اخترته.
- index لازم يبدأ من 1 ويكون متسلسل بدون فجوات.
- depends_on لازم يشير لـ index أصغر بس (مفيش موديول يعتمد على موديول جاي بعده).
- ممنوع اختراع ميزات غير مذكورة في البيانات فوق.
- كل النصوص بالعربية الفصحى الاحترافية.`;
}

const STAGE_SECTIONS_GUIDE = `اكتب الـ Prompt الكامل ده بالإنجليزية (لأنه موجّه مباشرة لأداة برمجة بالذكاء الاصطناعي)، ولازم يحتوي على الأقسام دي بالترتيب، كل قسم بعنوان Markdown واضح (##)، وبدون أي حد أقصى للطول — اكتب بقدر ما المهمة محتاجة فعليًا:

## Context
## Current State (إيه اللي المفروض يكون موجود بالفعل من الموديولات السابقة)
## Architecture
## Files Affected
## Database Changes
## Business Logic
## Frontend
## Backend
## UI/UX
## Validation Rules
## Security Requirements
## Performance Requirements
## Responsive Behavior
## Accessibility Requirements
## Acceptance Criteria
## Testing Requirements
## Definition of Done
## Expected Output
## Forbidden Changes (إيه اللي ممنوع يلمسه أو يغيّره من الموديولات السابقة)`;

/**
 * Prompt توليد Stage واحد كامل — بيستخدم Summary ذكية لباقي الـ Stages
 * السابقة (مش المحتوى الكامل) عشان يتجنب إعادة إرسال آلاف الأسطر مع
 * كل طلب، بالظبط زي ما طلب المستخدم.
 */
export function buildStagePrompt(
  projectName: string,
  targetTool: PromptTemplate,
  brain: BrainContent,
  prd: PRD,
  module: PrototypePromptPlanModule,
  priorModulesSummary: PrototypePromptPlanModule[],
  totalStages: number
): string {
  const priorContext =
    priorModulesSummary.length > 0
      ? priorModulesSummary
          .map((m) => `${m.index}. ${m.title} — ${m.summary}`)
          .join("\n")
      : "(لا يوجد — ده أول موديول في السلسلة)";

  return `أنت Principal Software Architect بتكتب Prompt احترافي كامل ومستقل لأداة برمجة بالذكاء الاصطناعي (${targetTool.toolName})، كجزء من سلسلة ${totalStages} Prompts متتابعة لبناء مشروع "${projectName}" بالكامل.

هذا هو الموديول رقم ${module.index} من ${totalStages}: **${module.title}**
وصفه المختصر: ${module.summary}

# ملخص الموديولات السابقة اللي المفروض تكون خلصت قبل كده (سياق بس — ملخصات مش محتوى كامل)
${priorContext}

# Project Brain (المصدر الكامل للحقيقة عن المشروع)
${formatBrainV2ForPrompt(brain)}

# PRD
${formatPRDContext(prd)}

# إرشادات خاصة بالأداة المستهدفة (${targetTool.toolName})
${targetTool.toolGuidance}

## المطلوب منك بالضبط
${STAGE_SECTIONS_GUIDE}

قواعد صارمة:
- أرجع نص الـ Prompt الكامل فقط، من غير أي مقدمة أو خاتمة أو تعليق من عندك، ومن غير Markdown code fences حوله.
- اعتمد فقط على البيانات المذكورة فوق — ممنوع اختراع أي ميزة أو معلومة غير موجودة في Brain أو PRD.
- كل قسم لازم يكون محدد وقابل للتنفيذ مباشرة — مفيش كلام عام غامض.
- التزم بحجم المشروع (${targetTool.toolName}) ونمط البنية اللي المفروض يكون اتبنى في الموديولات السابقة، وممنوع تقترح Stack مختلف.
- قسم "Forbidden Changes" لازم يوضح بالتحديد إيه اللي المفروض النموذج ميلمسوش من شغل الموديولات السابقة.`;
}
