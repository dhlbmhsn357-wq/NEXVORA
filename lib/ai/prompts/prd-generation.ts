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
  "success_metrics": ["مؤشر نجاح قابل للقياس"],
  "business_rules_detail": [{ "title": "...", "trigger_condition": "...", "threshold_value": "...", "on_violation": "...", "enforcement_point": "client|server|both" }],
  "system_messages_detail": [{ "event_name": "...", "message_type": "success|error|info|warning", "message_text": "..." }],
  "flow_specifications": [{ "flow_name": "...", "step_action": "...", "ui_elements": [{ "field_name": "...", "field_type": "...", "validation_rule": "..." }], "success_message": "...", "error_messages": ["..."] }],
  "persona_modules": [{ "persona_id": "معرف الشخصية أو null لموديول عام", "persona_name": "...", "persona_role": "...", "user_stories": [{ "code": "...", "title": "...", "as_a": "...", "i_want": "...", "so_that": "...", "status": "..." }], "requirements": [{ "code": "...", "title": "...", "description": "...", "priority": "...", "status": "..." }], "business_rules": [{ "title": "...", "trigger_condition": "...", "threshold_value": "...", "on_violation": "...", "enforcement_point": "client|server|both" }], "system_messages": [{ "event_name": "...", "message_type": "success|error|info|warning", "message_text": "..." }], "flow_specifications": [{ "flow_name": "...", "step_action": "...", "ui_elements": [{ "field_name": "...", "field_type": "...", "validation_rule": "..." }], "success_message": "...", "error_messages": ["..."] }] }],
  "state_machines_detail": [{ "name": "...", "description": "...", "states": ["حالة 1", "حالة 2"], "transitions": [{ "from": "...", "to": "...", "trigger": "..." }] }]
}`;

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- اعتمد على البيانات المذكورة فوق من Project Brain + التوصيات الذكية المقبولة معًا — ممنوع اختراع Personas أو مشاكل أو Features غير موجودة في البيانات.
- التوصيات الذكية المقبولة جزء إلزامي من متطلبات المشروع، مش اقتراحات جانبية — أي توصية مقبولة تمس functional_requirements أو non_functional_requirements أو goals لازم تنعكس فيها.
- لو البيانات غير كافية لقسم معين، اذكر ده بوضوح داخل القيمة النصية نفسها (مثلاً "بيانات غير كافية لتحديد هذا القسم") بدل ما تخترع محتوى.
- كل عنصر في acceptance_criteria لازم يكون بصيغة Given/When/Then بالظبط بالحقول الثلاثة، وممنوع أي صيغة تانية.
- كل عنصر في user_stories لازم يكون مرتبط بمشكلة حقيقية موجودة في Project Brain.
- لو فيه قواعد عمل/رسائل نظام/تفاصيل تدفّقات مُهيكلة في البيانات فوق، انقلها **كاملة وكما هي بالضبط** — القسم ده أهم مصدر للدقة، ممنوع تلخيصه أو حذف عناصر منه. لو مفيش بيانات مُهيكلة لقسم من التلاتة دول، أرجع مصفوفة فارغة \`[]\` — **ممنوع تخترع قواعد أو رسائل أو تفاصيل تدفّقات غير موجودة في المصدر**.
- \`persona_modules\`: لو فيه قسم "تقسيم حسب الشخصيات/الموديلات" في البيانات فوق، انقله **كما هو بالضبط** — مجرد إعادة تجميع للعناصر الموجودة بالفعل (user_stories/functional requirements/business_rules_detail/system_messages_detail/flow_specifications) حسب الشخصية، **ممنوع تخترع موديولات جديدة أو تنقل عنصر من موديول لموديول تاني أو تحذف موديول موجود**. لو مفيش بيانات، أرجع مصفوفة فارغة \`[]\`.
- \`state_machines_detail\`: زيرو اختراع بالكامل زي business_rules_detail بالظبط — لو فيه قسم "آلات الحالة" في البيانات فوق، انقل كل آلة بحالاتها وانتقالاتها **كما هي بالضبط وبنفس الترتيب**، ممنوع تخترع حالة أو انتقال غير موجود. لو مفيش بيانات، أرجع مصفوفة فارغة \`[]\`.
- كل النصوص بالعربية.`;

/**
 * Prompt التوليد الكامل — الـ16 قسم (11 استراتيجي + 3 مواصفة تنفيذية
 * zero-invention مضافة في 0116 + 2 قسم تقسيم-حسب-الموديول/آلات-حالة
 * مضافة في 0122) بنفس الترتيب المحدد بالظبط، بدون تغيير أسماء المفاتيح
 * أو ترتيبها أو إضافة أقسام جديدة.
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
    ? `\n## STRUCTURED DATA (PRIMARY SOURCE)\n${structuredBlock}\n\n> للأقسام \`user_stories\`, \`acceptance_criteria\`, \`functional_requirements\`, \`non_functional_requirements\` — لو فيه عناصر في البيانات المُهيكلة فوق، اعتبرها **المصدر الأساسي** ولا تخترع بدائل. Brain + التوصيات مصادر داعمة فقط لباقي الأقسام.\n> للأقسام \`business_rules_detail\`, \`system_messages_detail\`, \`flow_specifications\` — دي zero-invention بالكامل: لو موجودة فوق انقلها كما هي بالضبط، ولو مش موجودة أرجع \`[]\`. ممنوع تستنتجها من Brain.\n> لقسم \`persona_modules\` — دي إعادة تجميع بحتة للعناصر الموجودة فوق حسب الشخصية (قسم "تقسيم حسب الشخصيات/الموديلات")، ممنوع اختراع موديولات أو نقل عناصر بينها. لقسم \`state_machines_detail\` — زيرو اختراع بالكامل من قسم "آلات الحالة" فوق، ولو مش موجود أرجع \`[]\`.\n`
    : "";
  return `أنت Product Manager محترف بتكتب أول مسودة لـ Product Requirements Document (PRD) اعتمادًا على المعرفة المجمّعة في Project Brain + التوصيات الذكية المقبولة + البيانات المُهيكلة (Requirements/Stories/AC) الموجودة تحت. المسودة دي نقطة بداية للمراجعة البشرية، مش قرار نهائي.
${structuredSection}
${formatBrainV2ForPrompt(brain)}

## التوصيات الذكية المقبولة (لازم تنعكس في المستند)
${formatAcceptedRecommendationsForPrompt(acceptedRecommendations)}
${fusedContext ? `\n${fusedContext}\n` : ""}
## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط (16 قسم بنفس الترتيب، بدون أي مفتاح إضافي أو مفقود):

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
  business_rules_detail: `"business_rules_detail": [{ "title": "...", "trigger_condition": "...", "threshold_value": "...", "on_violation": "...", "enforcement_point": "client|server|both" }]`,
  system_messages_detail: `"system_messages_detail": [{ "event_name": "...", "message_type": "success|error|info|warning", "message_text": "..." }]`,
  flow_specifications: `"flow_specifications": [{ "flow_name": "...", "step_action": "...", "ui_elements": [{ "field_name": "...", "field_type": "...", "validation_rule": "..." }], "success_message": "...", "error_messages": ["..."] }]`,
  persona_modules: `"persona_modules": [{ "persona_id": "...", "persona_name": "...", "persona_role": "...", "user_stories": [{ "code": "...", "title": "...", "as_a": "...", "i_want": "...", "so_that": "...", "status": "..." }], "requirements": [{ "code": "...", "title": "...", "description": "...", "priority": "...", "status": "..." }], "business_rules": [{ "title": "...", "trigger_condition": "...", "threshold_value": "...", "on_violation": "...", "enforcement_point": "client|server|both" }], "system_messages": [{ "event_name": "...", "message_type": "success|error|info|warning", "message_text": "..." }], "flow_specifications": [{ "flow_name": "...", "step_action": "...", "ui_elements": [{ "field_name": "...", "field_type": "...", "validation_rule": "..." }], "success_message": "...", "error_messages": ["..."] }] }]`,
  state_machines_detail: `"state_machines_detail": [{ "name": "...", "description": "...", "states": ["..."], "transitions": [{ "from": "...", "to": "...", "trigger": "..." }] }]`,
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
    ? `\n## STRUCTURED DATA (PRIMARY SOURCE)\n${structuredBlock}\n\n> لو القسم المطلوب من الأقسام المُهيكلة (user_stories/acceptance_criteria/functional_requirements/non_functional_requirements) استخدم البيانات فوق كمصدر أساسي، ولا تخترع عناصر بديلة.\n> لو القسم المطلوب هو business_rules_detail/system_messages_detail/flow_specifications/state_machines_detail فهو zero-invention بالكامل: انقل العناصر الموجودة فوق كما هي بالضبط، ولو مفيش بيانات مُهيكلة أرجع \`[]\`.\n> لو القسم المطلوب هو persona_modules فهو إعادة تجميع بحتة لما فوق حسب الشخصية، ممنوع اختراع موديولات أو نقل عناصر.\n`
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
