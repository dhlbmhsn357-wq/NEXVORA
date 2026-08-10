import type { PRDSectionKey, ProjectRecommendation } from "@/lib/types/database";
import type { BrainContent } from "@/lib/brain-v2/types";
import { formatBrainV2ForPrompt, formatAcceptedRecommendationsForPrompt } from "@/lib/brain-v2/downstream-context";

const SCHEMA_TEMPLATE = `{
  "overview": "نظرة عامة موجزة عن المنتج المطلوب بناؤه",
  "problem_statement": "وصف دقيق للمشكلة اللي بيحلها المنتج، مبني على نقاط الألم الموجودة",
  "goals": ["هدف واضح وقابل للقياس"],
  "out_of_scope": ["ما لن يتم تنفيذه في هذا الإصدار"],
  "target_users": ["فئة مستخدم مستهدف موجودة فعليًا في بيانات المشروع"],
  "user_stories": [{ "role": "بصفتي ...", "want": "أريد ...", "benefit": "حتى ..." }],
  "acceptance_criteria": [{ "given": "بافتراض ...", "when": "عندما ...", "then": "فإن ..." }],
  "functional_requirements": ["متطلب وظيفي محدد"],
  "non_functional_requirements": ["متطلب غير وظيفي (أداء، أمان، إلخ)"],
  "risks_assumptions": ["مخاطرة أو افتراض"],
  "success_metrics": ["مؤشر نجاح قابل للقياس"]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- اعتمد على البيانات المذكورة فوق من Project Brain + التوصيات الذكية المقبولة معًا — ممنوع اختراع Personas أو مشاكل أو Features غير موجودة في البيانات.
- التوصيات الذكية المقبولة جزء إلزامي من متطلبات المشروع، مش اقتراحات جانبية — أي توصية مقبولة تمس functional_requirements أو non_functional_requirements أو goals لازم تنعكس فيها.
- لو البيانات غير كافية لقسم معين، اذكر ده بوضوح داخل القيمة النصية نفسها (مثلاً "بيانات غير كافية لتحديد هذا القسم") بدل ما تخترع محتوى.
- كل عنصر في acceptance_criteria لازم يكون بصيغة Given/When/Then بالظبط بالحقول الثلاثة، وممنوع أي صيغة تانية.
- كل عنصر في user_stories لازم يكون مرتبط بمشكلة حقيقية موجودة في Project Brain.
- كل النصوص بالعربية.`;

/**
 * Prompt التوليد الكامل — الأقسام الإحدى عشر بنفس الترتيب المحدد بالظبط،
 * بدون تغيير أسماء المفاتيح أو ترتيبها أو إضافة أقسام جديدة.
 *
 * acceptedRecommendations: التوصيات الذكية (Phase 4) اللي اتقبلت فعليًا —
 * "الـ PRD ممنوع يتولّد من الـ Brain مباشرة، لازم يشمل التوصيات المعتمدة."
 */
export function buildPRDGenerationPrompt(
  brain: BrainContent,
  acceptedRecommendations: ProjectRecommendation[] = [],
  fusedContext = "",
  structuredBlock = ""
): string {
  const structuredSection = structuredBlock
    ? `\n## STRUCTURED DATA (PRIMARY SOURCE)\n${structuredBlock}\n\n> للأقسام \`user_stories\`, \`acceptance_criteria\`, \`functional_requirements\`, \`non_functional_requirements\` — لو فيه عناصر في البيانات المُهيكلة فوق، اعتبرها **المصدر الأساسي** ولا تخترع بدائل. Brain + التوصيات مصادر داعمة فقط لباقي الأقسام.\n`
    : "";
  return `أنت Product Manager محترف بتكتب أول مسودة لـ Product Requirements Document (PRD) اعتمادًا على المعرفة المجمّعة في Project Brain + التوصيات الذكية المقبولة + البيانات المُهيكلة (Requirements/Stories/AC) الموجودة تحت. المسودة دي نقطة بداية للمراجعة البشرية، مش قرار نهائي.
${structuredSection}
${formatBrainV2ForPrompt(brain)}

## التوصيات الذكية المقبولة (لازم تنعكس في المستند)
${formatAcceptedRecommendationsForPrompt(acceptedRecommendations)}
${fusedContext ? `\n${fusedContext}\n` : ""}
## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط (11 قسم بنفس الترتيب، بدون أي مفتاح إضافي أو مفقود):

${SCHEMA_TEMPLATE}

${STRICT_RULES}`;
}

const sectionDescriptions: Record<PRDSectionKey, string> = {
  overview: `"overview": "نظرة عامة موجزة عن المنتج المطلوب بناؤه"`,
  problem_statement: `"problem_statement": "وصف دقيق للمشكلة، مبني على نقاط الألم الموجودة"`,
  goals: `"goals": ["هدف واضح وقابل للقياس"]`,
  out_of_scope: `"out_of_scope": ["ما لن يتم تنفيذه في هذا الإصدار"]`,
  target_users: `"target_users": ["فئة مستخدم مستهدف موجودة فعليًا في بيانات المشروع"]`,
  user_stories: `"user_stories": [{ "role": "...", "want": "...", "benefit": "..." }]`,
  acceptance_criteria: `"acceptance_criteria": [{ "given": "...", "when": "...", "then": "..." }]`,
  functional_requirements: `"functional_requirements": ["متطلب وظيفي محدد"]`,
  non_functional_requirements: `"non_functional_requirements": ["متطلب غير وظيفي"]`,
  risks_assumptions: `"risks_assumptions": ["مخاطرة أو افتراض"]`,
  success_metrics: `"success_metrics": ["مؤشر نجاح قابل للقياس"]`,
};

/**
 * Prompt إعادة توليد قسم واحد بس — بياخد باقي أقسام PRD الحالية كسياق
 * عشان القسم الجديد يفضل متسق معاهم، من غير ما يعيد توليد المستند كله.
 */
export function buildPRDSectionRegenerationPrompt(
  brain: BrainContent,
  sectionKey: PRDSectionKey,
  currentPRDContext: Record<string, unknown>,
  acceptedRecommendations: ProjectRecommendation[] = [],
  fusedContext = "",
  structuredBlock = ""
): string {
  const structuredSection = structuredBlock
    ? `\n## STRUCTURED DATA (PRIMARY SOURCE)\n${structuredBlock}\n\n> لو القسم المطلوب من الأقسام المُهيكلة (user_stories/acceptance_criteria/functional_requirements/non_functional_requirements) استخدم البيانات فوق كمصدر أساسي، ولا تخترع عناصر بديلة.\n`
    : "";
  return `أنت Product Manager محترف بتعيد كتابة قسم واحد بس من PRD موجود، اعتمادًا على Project Brain + التوصيات الذكية المقبولة + البيانات المُهيكلة وباقي أقسام المستند الحالية (كسياق بس، متعدّلش فيها).
${structuredSection}
${formatBrainV2ForPrompt(brain)}

## التوصيات الذكية المقبولة (لازم تنعكس في القسم لو مرتبطة بيه)
${formatAcceptedRecommendationsForPrompt(acceptedRecommendations)}
${fusedContext ? `\n${fusedContext}\n` : ""}
## باقي أقسام PRD الحالية (للسياق فقط)
${JSON.stringify(currentPRDContext, null, 2)}

## المطلوب منك بالضبط
أعد توليد القسم ده بس: **${sectionKey}**

أرجع **JSON فقط** يحتوي على مفتاح واحد بالظبط:
{ ${sectionDescriptions[sectionKey]} }

${STRICT_RULES}`;
}
