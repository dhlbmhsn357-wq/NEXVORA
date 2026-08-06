import type { MeetingPresentationSlideKey } from "@/lib/types/database";
import type { BrainContent } from "@/lib/brain-v2/types";
import type { MeetingPrepSections } from "@/lib/meeting-prep/types";
import { formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";

const MEETING_PRESENTATION_SLIDE_KEYS: MeetingPresentationSlideKey[] = [
  "cover",
  "executive_summary",
  "business_problem",
  "business_goals",
  "current_workflow",
  "future_workflow",
  "actors",
  "modules",
  "screens",
  "architecture",
  "timeline",
  "risks",
  "open_questions",
  "client_decisions",
  "final_summary",
];

const SLIDE_LABELS_AR: Record<MeetingPresentationSlideKey, string> = {
  cover: "غلاف المشروع",
  executive_summary: "الملخص التنفيذي",
  business_problem: "المشكلة التجارية",
  business_goals: "الأهداف التجارية",
  current_workflow: "سير العمل الحالي",
  future_workflow: "سير العمل المستقبلي",
  actors: "الأطراف المعنية (Actors)",
  modules: "الوحدات (Modules)",
  screens: "الشاشات",
  architecture: "البنية التقنية",
  timeline: "الجدول الزمني",
  risks: "المخاطر",
  open_questions: "أسئلة مفتوحة",
  client_decisions: "قرارات العميل",
  final_summary: "الملخص الختامي",
};

/** شكل JSON مطلوب لكل شريحة — مختلف حسب طبيعتها، مش قالب موحّد. */
const SLIDE_SCHEMAS: Record<MeetingPresentationSlideKey, string> = {
  cover: `{ "project_name": "...", "client_name": "...", "meeting_date": "YYYY-MM-DD أو null", "pm_name": "...", "current_phase": "...", "status": "...", "progress_percent": 0-100 }`,
  executive_summary: `{ "summary": "فقرة قصيرة احترافية", "key_points": ["نقطة 1", "نقطة 2", "..."] }`,
  business_problem: `{ "problem_statement": "...", "timeline": [{ "label": "...", "date": "YYYY-MM-DD أو null" }], "pain_points": [{ "title": "...", "severity": "low|medium|high|critical" }], "business_impact": "..." }`,
  business_goals: `{ "goals": [{ "title": "...", "priority": "low|medium|high", "progress_percent": 0-100, "expected_outcome": "..." }], "kpis": [{ "name": "...", "target": "..." }] }`,
  current_workflow: `{ "steps": [{ "title": "...", "description": "..." }] }`,
  future_workflow: `{ "steps": [{ "title": "...", "description": "..." }], "improvements": ["تحسين 1", "..."] }`,
  actors: `{ "actors": [{ "name": "...", "responsibilities": ["..."], "permissions": ["..."], "pain_points": ["..."] }] }`,
  modules: `{ "modules": [{ "name": "...", "purpose": "...", "priority": "low|medium|high", "complexity": "XS|S|M|L|XL", "dependencies": ["..."] }] }`,
  screens: `{ "screens": [{ "name": "...", "goal": "...", "functions": ["..."] }] }`,
  architecture: `{ "frontend": "...", "backend": "...", "database": "...", "storage": "...", "authentication": "...", "integrations": ["..."] }`,
  timeline: `{ "milestones": [{ "title": "...", "date": "YYYY-MM-DD أو null", "progress_percent": 0-100 }] }`,
  risks: `{ "risks": [{ "title": "...", "probability": "low|medium|high", "impact": "low|medium|high", "mitigation": "..." }] }`,
  open_questions: `{ "questions": [{ "question": "...", "context": "..." }] }`,
  client_decisions: `{ "decisions": [{ "decision": "...", "date": "YYYY-MM-DD أو null", "rationale": "..." }] }`,
  final_summary: `{ "next_steps": ["..."], "meeting_objectives": ["..."], "closing_note": "..." }`,
};

function formatMeetingPrepContext(sections: Partial<MeetingPrepSections> | null): string {
  if (!sections || Object.keys(sections).length === 0) {
    return "(لا يوجد Meeting Preparation جاهز لهذا المشروع بعد)";
  }
  const parts: string[] = [];
  if (sections.executive_brief) parts.push(`## الملخص التنفيذي للاجتماع\n${JSON.stringify(sections.executive_brief.content, null, 2)}`);
  if (sections.meeting_objectives) parts.push(`## أهداف الاجتماع\n${JSON.stringify(sections.meeting_objectives.content, null, 2)}`);
  if (sections.suggested_agenda) parts.push(`## الأجندة المقترحة\n${JSON.stringify(sections.suggested_agenda.content, null, 2)}`);
  if (sections.smart_questions) parts.push(`## أسئلة ذكية للطرح\n${JSON.stringify(sections.smart_questions.content, null, 2)}`);
  if (sections.decision_checklist) parts.push(`## قرارات مطلوبة\n${JSON.stringify(sections.decision_checklist.content, null, 2)}`);
  return parts.length > 0 ? parts.join("\n\n") : "(لا يوجد Meeting Preparation جاهز لهذا المشروع بعد)";
}

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- اعتمد فقط على البيانات المذكورة فوق — ممنوع اختراع أي معلومة أو رقم أو تاريخ أو ميزة غير موجودة.
- لو معلومة معينة غير متوفرة، اترك القيمة نص واضح ("لم يُحدَّد بعد") أو مصفوفة فاضية [] بدل ما تخترعها — ممنوع تسيب أي حقل مطلوب فاضي تمامًا بدون قيمة.
- كل الحقول Enum (severity/priority/probability/impact/complexity) لازم تكون بالظبط من القيم المسموحة المذكورة، بدون أي قيمة تانية.
- progress_percent أرقام صحيحة بين 0 و100 بس.
- التواريخ بصيغة YYYY-MM-DD لو معروفة، وإلا null (مش نص فارغ).
- العرض موجّه لاجتماع مباشر مع العميل — لغة عربية فصحى احترافية واضحة، جمل قصيرة قابلة للعرض على شاشة.
- مصفوفات القوائم (actors/modules/screens/goals/risks/...): 2 إلى 6 عناصر لكل شريحة كحد معقول، حسب البيانات المتاحة فعليًا — ممنوع تكرار أو حشو.`;

function schemaTemplate(): string {
  return `{
${MEETING_PRESENTATION_SLIDE_KEYS.map((k) => `  "${k}": ${SLIDE_SCHEMAS[k]}  // ${SLIDE_LABELS_AR[k]}`).join(",\n")}
}`;
}

/**
 * Prompt توليد عرض اجتماع العميل الكامل — 15 شريحة بشكل بنيوي مختلف
 * لكل واحدة (مش نص موحّد)، يعتمد على Project Brain (المصدر الرسمي،
 * مجمّع أصلًا من Discovery Form + Discovery Analysis + ملاحظات PM
 * + القرارات الأخيرة عبر Knowledge Aggregation Layer) + PRD الحالي
 * (لو موجود، لتفاصيل الوحدات/الشاشات/المتطلبات الدقيقة) + Meeting
 * Preparation الخاص بهذا الاجتماع تحديدًا.
 */
export function buildMeetingPresentationPrompt(
  brain: BrainContent,
  meetingPrepSections: Partial<MeetingPrepSections> | null,
  meetingTitle: string,
  prdSummary: string | null
): string {
  return `أنت مستشار منتج ومصمم عروض تقديمية محترف بتجهّز عرض شرائح حقيقي (Slide Deck) لاجتماع مباشر مع العميل بعنوان "${meetingTitle}"، اعتمادًا فقط على البيانات الحقيقية للمشروع تحت.

# Project Brain (المصدر الرسمي لكل معرفة المشروع)
${formatBrainV2ForPrompt(brain)}

# مسودة PRD الحالية (لو موجودة — لتفاصيل الوحدات/الشاشات/المتطلبات الدقيقة)
${prdSummary ?? "(لا يوجد PRD معتمد أو مسودة لهذا المشروع بعد)"}

# تجهيزات هذا الاجتماع تحديدًا (Meeting Preparation)
${formatMeetingPrepContext(meetingPrepSections)}

## المطلوب منك بالضبط
أرجع **JSON فقط** بـ ${MEETING_PRESENTATION_SLIDE_KEYS.length} مفتاحًا بالضبط (بدون أي مفتاح إضافي أو مفقود)، كل مفتاح بشكله البنيوي المحدد له تحديدًا (مش نص موحّد لكل الشرائح):

${schemaTemplate()}

${STRICT_RULES}`;
}

/**
 * Prompt إعادة توليد شريحة واحدة بس، بسياق باقي الشرائح الحالية.
 */
export function buildMeetingPresentationSlideRegenerationPrompt(
  brain: BrainContent,
  meetingPrepSections: Partial<MeetingPrepSections> | null,
  meetingTitle: string,
  slideKey: MeetingPresentationSlideKey,
  currentSlides: Record<string, unknown>,
  prdSummary: string | null
): string {
  return `أنت مستشار منتج ومصمم عروض تقديمية محترف بتعيد كتابة شريحة واحدة بس من عرض اجتماع "${meetingTitle}" الموجود، اعتمادًا على البيانات الحقيقية وباقي الشرائح الحالية (للسياق فقط).

# Project Brain
${formatBrainV2ForPrompt(brain)}

# مسودة PRD الحالية
${prdSummary ?? "(لا يوجد PRD معتمد أو مسودة لهذا المشروع بعد)"}

# تجهيزات هذا الاجتماع
${formatMeetingPrepContext(meetingPrepSections)}

# باقي الشرائح الحالية (للسياق فقط)
${JSON.stringify(currentSlides, null, 2)}

## المطلوب منك بالضبط
أعد توليد الشريحة دي بس: **${slideKey}** (${SLIDE_LABELS_AR[slideKey]})، بنفس شكلها البنيوي المحدد:

أرجع **JSON فقط** بمفتاح واحد بالظبط:
{ "${slideKey}": ${SLIDE_SCHEMAS[slideKey]} }

${STRICT_RULES}`;
}

export { MEETING_PRESENTATION_SLIDE_KEYS, SLIDE_LABELS_AR };
