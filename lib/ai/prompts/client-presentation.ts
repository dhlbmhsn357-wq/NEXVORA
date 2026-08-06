import type {
  ClientPresentationSlideKey,
  DecisionMemoryEntry,
  PRD,
  PresentationLanguage,
  ProjectRecommendation,
  PrototypeReview,
} from "@/lib/types/database";

function languageDirective(language: PresentationLanguage): string {
  return language === "en"
    ? "IMPORTANT — LANGUAGE: Write ALL slide text in professional, confident business English (consultant-grade). Keep the exact same JSON keys; only the human-readable values are in English."
    : "مهم — اللغة: كل النصوص بالعربية الفصحى الاحترافية.";
}
import type { BrainContent } from "@/lib/brain-v2/types";
import { formatBrainV2ForPrompt, formatAcceptedRecommendationsForPrompt } from "@/lib/brain-v2/downstream-context";

/**
 * سياق أعمال إضافي يُجمَّع تلقائيًّا من مراحل سابقة (توصيات مقبولة +
 * ذاكرة قرارات) عشان العرض التنفيذي يعكس كل ما اتفق عليه فعلًا، مش بس
 * Brain/PRD. كله أعمال-فقط (بدون أي كشف تقني).
 */
export interface ClientPresentationExtraContext {
  recommendations: ProjectRecommendation[];
  decisions: DecisionMemoryEntry[];
}

function formatDecisionsForPrompt(decisions: DecisionMemoryEntry[]): string {
  if (decisions.length === 0) return "(لا توجد قرارات موثّقة)";
  return decisions
    .slice(0, 12)
    .map((d) => `- ${d.decision_title}: ${d.rationale}${d.outcome ? ` (النتيجة: ${d.outcome})` : ""}`)
    .join("\n");
}

function formatExtraContext(extra: ClientPresentationExtraContext | null): string {
  if (!extra) return "";
  const recs = formatAcceptedRecommendationsForPrompt(extra.recommendations);
  const decisions = formatDecisionsForPrompt(extra.decisions);
  return `

# توصيات مقبولة (مصدر رسمي للنطاق والأولويات)
${recs}

# قرارات موثّقة في المشروع
${decisions}`;
}

function formatPRDContext(prd: PRD): string {
  return `## Overview
${prd.overview}

## Problem Statement
${prd.problem_statement}

## Goals
${prd.goals.map((g) => `- ${g}`).join("\n")}

## Functional Requirements (أهم الميزات)
${prd.functional_requirements.map((f) => `- ${f}`).join("\n")}

## Out of Scope
${prd.out_of_scope.map((o) => `- ${o}`).join("\n")}`;
}

function formatReviewContext(review: PrototypeReview | null): string {
  if (!review || review.version === 0) {
    return "(لا توجد مراجعة كود فعلية لهذا المشروع حتى الآن — لا تذكر أي نسبة إنجاز رقمية، وصف الحالة بالكلام فقط)";
  }
  return `نسبة الإنجاز الفعلية المقاسة: ${review.completion_percentage}%
حالة المراجعة: ${review.overall_status}
ملخص التوصية: ${review.gap_report.recommendation_summary}`;
}

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- اعتمد فقط على البيانات المذكورة فوق — ممنوع اختراع أي ميزة أو معلومة غير موجودة.
- ممنوع اختراع أي نسبة إنجاز أو تاريخ مستهدف غير مذكور — لو معلومة زمنية غير متوفرة، استخدم وصف نسبي عام ("المرحلة القادمة") بدل تاريخ محدد مُختلق.
- العرض موجّه للعميل النهائي مباشرة — ممنوع أي مصطلحات تقنية (أسماء جداول، ملفات، API، قواعد بيانات) إلا في شريحة Architecture، واللي لازم تُشرح بلغة مبسّطة موجّهة لغير التقنيين.
- التزم بلغة العرض المحدّدة في التعليمات فوق، بأسلوب استشاري واثق (McKinsey/BCG-level) وصادق بدون مبالغة تسويقية فارغة.
- لو معلومة معينة غير متوفرة في البيانات، اذكر ده بوضوح داخل النص بدل ما تستنتجها أو تخترعها.
- كل مصفوفة (items/features/points/...) لازم تحتوي محتوى حقيقي مبني على البيانات — ممنوع تسيبها فاضية إلا لو مفيش أي بيانات ذات صلة إطلاقًا.`;

const SCHEMA_TEMPLATE = `{
  "cover": { "title": "عنوان جذاب للمشروع", "subtitle": "جملة فرعية قصيرة", "client_name": "<اسم العميل>" },
  "agenda": { "items": ["بند 1", "بند 2", "..."] },
  "executive_summary": { "title": "الملخص التنفيذي", "body": "فقرة تلخّص المشروع بالكامل لصانع القرار", "highlights": ["أهم نقطة 1", "أهم نقطة 2"] },
  "about_company": { "title": "عن الشركة", "body": "تعريف موجز بالعميل ونشاطه وحجمه من واقع البيانات" },
  "business_problem": { "title": "المشكلة", "body": "وصف المشكلة اللي واجهها العميل، من واقع البيانات" },
  "current_situation": { "title": "الوضع الحالي", "body": "وصف الوضع قبل الحل", "points": ["نقطة 1", "نقطة 2"] },
  "pain_points": { "title": "نقاط الألم", "items": ["نقطة ألم 1", "نقطة ألم 2"] },
  "our_understanding": { "title": "فهمنا لأعمالك", "body": "إثبات إننا فهمنا طبيعة العمل واحتياجاته", "points": ["ملاحظة 1", "ملاحظة 2"] },
  "vision": { "title": "رؤية الحل", "body": "الرؤية اللي بيحققها الحل للعميل على مستوى الأعمال" },
  "solution": { "title": "الحل", "body": "وصف الحل المقترح/المنفّذ" },
  "scope": { "in_scope": ["داخل النطاق 1"], "out_of_scope": ["خارج النطاق 1"] },
  "features": { "title": "أهم الميزات", "features": ["ميزة 1", "ميزة 2"] },
  "modules": { "title": "وحدات النظام", "items": ["وحدة 1 — وصفها بلغة أعمال", "وحدة 2 — وصفها"] },
  "workflow": { "title": "سير العمل الجديد", "items": ["خطوة 1", "خطوة 2", "خطوة 3"] },
  "before_after": { "title": "قبل وبعد", "pairs": [{ "before": "الوضع قبل الحل", "after": "الوضع بعد الحل" }] },
  "departments": { "title": "الأقسام المستفيدة", "items": ["قسم 1 — كيف يستفيد", "قسم 2 — كيف يستفيد"] },
  "user_roles": { "title": "المستخدمون والأدوار", "items": ["الدور 1 — ماذا يفعل في النظام", "الدور 2 — ماذا يفعل"] },
  "reports": { "title": "التقارير ولوحات المتابعة", "items": ["تقرير/لوحة 1", "تقرير/لوحة 2"] },
  "ai_capabilities": { "title": "قدرات الذكاء الاصطناعي", "items": ["قدرة 1 بلغة أعمال", "قدرة 2"] },
  "timeline": { "title": "الجدول الزمني", "phases": [{ "name": "المرحلة الأولى", "duration": "٤ أسابيع", "description": "..." }] },
  "architecture": { "title": "نظرة عامة على النظام (مبسّطة)", "description": "شرح مبسّط لكيفية عمل النظام بلغة غير تقنية", "components": ["المكوّن 1", "المكوّن 2"] },
  "risks": { "title": "المخاطر وخطط المواجهة", "items": [{ "risk": "خطر محتمل", "mitigation": "طريقة المواجهة" }] },
  "roi": { "title": "العائد على الاستثمار", "metrics": [{ "name": "بند العائد", "value": "قيمة/نسبة", "description": "شرح بلغة أعمال" }] },
  "kpis": { "title": "مؤشرات الأداء الرئيسية", "metrics": [{ "name": "المؤشر", "value": "القيمة الحالية/المستهدفة", "description": "..." }] },
  "roadmap": { "title": "خارطة الطريق", "milestones": [{ "name": "معلم 1", "target_date": "وصف زمني نسبي أو تاريخ حقيقي إن وجد", "description": "..." }] },
  "transformation": { "title": "رحلة التحوّل", "body": "كيف ينقل الحل أعمال العميل نقلة نوعية", "points": ["مكسب 1", "مكسب 2"] },
  "next_steps": { "title": "الخطوات القادمة", "items": ["خطوة 1"] },
  "qa": { "title": "أسئلة وأجوبة", "items": ["سؤال متوقع 1 وإجابته المختصرة", "سؤال متوقع 2 وإجابته المختصرة"] },
  "closing": { "title": "خاتمة", "body": "رسالة ختامية قصيرة واثقة" }
}`;

/**
 * Prompt توليد عرض العميل — يعتمد على Project Brain وPRD وPrototype
 * Review (إن وجد) + سياق أعمال إضافي (توصيات مقبولة + قرارات موثّقة)،
 * ويطلب JSON منظم بـ 29 شريحة تنفيذية (Cover إلى Closing) بمستوى
 * استشاري احترافي، أعمال-فقط بدون كشف تقني.
 */
export function buildClientPresentationPrompt(
  clientName: string,
  brain: BrainContent,
  prd: PRD,
  review: PrototypeReview | null,
  extra: ClientPresentationExtraContext | null = null,
  language: PresentationLanguage = "ar"
): string {
  return `أنت Senior Management Consultant (بمستوى McKinsey/BCG) بتجهّز عرض تقديمي احترافي كامل لعميل نهائي (مش فريق تقني)، اعتمادًا فقط على البيانات الحقيقية للمشروع تحت.

${languageDirective(language)}

اسم العميل: ${clientName}

# Project Brain
${formatBrainV2ForPrompt(brain)}

# PRD
${formatPRDContext(prd)}

# حالة التنفيذ الفعلية
${formatReviewContext(review)}
${formatExtraContext(extra)}

## المطلوب منك بالضبط
أرجع **JSON فقط** بـ 29 مفتاحًا بالضبط (بدون أي مفتاح إضافي أو مفقود)، بنفس الشكل التالي بالضبط:

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}

const SLIDE_SCHEMA_HINTS: Record<ClientPresentationSlideKey, string> = {
  cover: `{ "title": "...", "subtitle": "...", "client_name": "..." }`,
  agenda: `{ "items": ["..."] }`,
  executive_summary: `{ "title": "...", "body": "...", "highlights": ["..."] }`,
  about_company: `{ "title": "...", "body": "..." }`,
  business_problem: `{ "title": "...", "body": "..." }`,
  current_situation: `{ "title": "...", "body": "...", "points": ["..."] }`,
  pain_points: `{ "title": "...", "items": ["..."] }`,
  our_understanding: `{ "title": "...", "body": "...", "points": ["..."] }`,
  vision: `{ "title": "...", "body": "..." }`,
  solution: `{ "title": "...", "body": "..." }`,
  scope: `{ "in_scope": ["..."], "out_of_scope": ["..."] }`,
  features: `{ "title": "...", "features": ["..."] }`,
  modules: `{ "title": "...", "items": ["..."] }`,
  workflow: `{ "title": "...", "items": ["..."] }`,
  before_after: `{ "title": "...", "pairs": [{ "before": "...", "after": "..." }] }`,
  departments: `{ "title": "...", "items": ["..."] }`,
  user_roles: `{ "title": "...", "items": ["..."] }`,
  reports: `{ "title": "...", "items": ["..."] }`,
  ai_capabilities: `{ "title": "...", "items": ["..."] }`,
  timeline: `{ "title": "...", "phases": [{ "name": "...", "duration": "...", "description": "..." }] }`,
  architecture: `{ "title": "...", "description": "...", "components": ["..."] }`,
  risks: `{ "title": "...", "items": [{ "risk": "...", "mitigation": "..." }] }`,
  roi: `{ "title": "...", "metrics": [{ "name": "...", "value": "...", "description": "..." }] }`,
  kpis: `{ "title": "...", "metrics": [{ "name": "...", "value": "...", "description": "..." }] }`,
  roadmap: `{ "title": "...", "milestones": [{ "name": "...", "target_date": "...", "description": "..." }] }`,
  transformation: `{ "title": "...", "body": "...", "points": ["..."] }`,
  next_steps: `{ "title": "...", "items": ["..."] }`,
  qa: `{ "title": "...", "items": ["..."] }`,
  closing: `{ "title": "...", "body": "..." }`,
};

/**
 * Prompt إعادة توليد شريحة واحدة بس، بسياق باقي الشرائح الحالية.
 */
export function buildClientPresentationSlideRegenerationPrompt(
  clientName: string,
  brain: BrainContent,
  prd: PRD,
  review: PrototypeReview | null,
  slideKey: ClientPresentationSlideKey,
  currentSlides: Record<string, unknown>,
  extra: ClientPresentationExtraContext | null = null,
  language: PresentationLanguage = "ar"
): string {
  return `أنت Senior Management Consultant بتعيد كتابة شريحة واحدة بس من عرض عميل موجود، اعتمادًا على البيانات الحقيقية وباقي الشرائح الحالية (للسياق فقط).

${languageDirective(language)}

اسم العميل: ${clientName}

# Project Brain
${formatBrainV2ForPrompt(brain)}

# PRD
${formatPRDContext(prd)}

# حالة التنفيذ الفعلية
${formatReviewContext(review)}
${formatExtraContext(extra)}

# باقي الشرائح الحالية (للسياق فقط)
${JSON.stringify(currentSlides, null, 2)}

## المطلوب منك بالضبط
أعد توليد الشريحة دي بس: **${slideKey}**

أرجع **JSON فقط** بمفتاح واحد بالظبط:
{ "${slideKey}": ${SLIDE_SCHEMA_HINTS[slideKey]} }

${STRICT_RULES}`;
}
