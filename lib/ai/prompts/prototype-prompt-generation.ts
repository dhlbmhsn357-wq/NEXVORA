import type { PRD, PrototypePromptSectionKey } from "@/lib/types/database";
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

## Out of Scope (من الـ PRD)
${prd.out_of_scope.map((o) => `- ${o}`).join("\n")}

## Target Users
${prd.target_users.map((t) => `- ${t}`).join("\n")}

## User Stories (يوجد بالضبط ${prd.user_stories.length} — لازم تظهر كلهم بدون حذف أو تلخيص)
${prd.user_stories.map((s, i) => `${i + 1}. ${s.role}, ${s.want}, ${s.benefit}`).join("\n")}

## Acceptance Criteria (يوجد بالضبط ${prd.acceptance_criteria.length} — لازم تظهر كلهم بدون حذف)
${prd.acceptance_criteria.map((c, i) => `${i + 1}. Given ${c.given} When ${c.when} Then ${c.then}`).join("\n")}

## Functional Requirements
${prd.functional_requirements.map((f) => `- ${f}`).join("\n")}

## Non-Functional Requirements
${prd.non_functional_requirements.map((f) => `- ${f}`).join("\n")}

## Risks & Assumptions
${prd.risks_assumptions.map((r) => `- ${r}`).join("\n")}`;
}

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- ممنوع تلخيص الـ PRD — كل User Story وكل Acceptance Criteria المذكورين فوق لازم يظهروا بالكامل في القسم المناسب.
- ممنوع حذف أي Pain Point من Project Brain.
- ممنوع اختراع Features أو تقنيات غير مذكورة في البيانات فوق.
- حوّل كل Requirement لتعليمات تنفيذية واضحة وقابلة للتنفيذ مباشرة، مش وصف عام.
- محتوى كل قسم بصيغة Markdown (عناوين فرعية، Bullet points، إلخ حسب الحاجة) بس من غير عنوان القسم الرئيسي نفسه (# ...) — العنوان هيتضاف تلقائيًا بعدين.
- كل النصوص بالإنجليزية (البرومت موجّه لأداة برمجية، مش لعرض على المستخدم).

## قواعد منع التعارض المعماري (مهمة جدًا — عشان البرومت الناتج يبقى متسق وقابل للتنفيذ)
- المشروع ده تطبيق مستقل (Standalone) بيتبني من الصفر لمشروع العميل — مش امتداد لأي نظام قائم. ممنوع نهائيًا تشير لـ "PM Operating System" أو تفرض Supabase أو أي بنية مش مذكورة صراحةً في بيانات المشروع فوق.
- احسم Stack تقني واحد متسق للمشروع كله (Framework, Language, Styling, وطبقة بيانات واحدة) واذكره صراحةً في technical_context. ممنوع أي تعارض: لا تجمع بين ORM محلي + قاعدة مضمّنة (زي Prisma + SQLite) وبين Backend مستضاف (زي Supabase) لنفس البيانات، ولا تكتب "ابنِ من الصفر" و"كمّل مشروع قائم" مع بعض. لو فيه غموض، قرّر خيار واحد وطبّقه في كل مكان.
- أي حقل حالة/دورة حياة (اشتراك، دفع، حضور، طلب...) لازم يتحدد له State Machine صريح بكل الحالات والانتقالات المسموحة — مش حالتين بس (مثلاً الدفع: pending → processing → paid/failed/cancelled، مش pending/paid وخلاص).
- أي تكامل خارجي (Zoom, Vimeo, بوابة دفع...) لازم يتوصف كـ Mock/Simulation صراحةً مع شكل الـ State والـ Response المتوقع — ممنوع يتساب مبهم.
- أي بيانات منظمة (زي أسئلة الاختبار كـ JSON) لازم يتحدد شكلها بالظبط (الحقول وأنواعها)، وأي رفع ملفات لازم يتحدد له الأنواع المسموحة والحد الأقصى للحجم وخطوات التحقق (Validation).
- لو فيه أكتر من Role، ضمّن جدول صلاحيات RBAC صريح (كل Role × المورد × قراءة/تعديل/حذف) داخل architecture_notes.
- ضمّن Non-Functional Requirements عملية حيثما يلزم (أداء، أمان، معالجة أخطاء، Accessibility).
- قسّم التنفيذ إلى مراحل مرقّمة (Milestones/Phases) داخل definition_of_done عشان الأداة تبني تدريجيًا بدل ما تحاول تنفّذ كل حاجة في جلسة واحدة.

## قواعد التصميم (UI/UX) — إلزامية، مفيش تفاوض فيها
المخرج النهائي لازم يبان وكأنه منتج SaaS عالمي احترافي (بمستوى Linear, Stripe Dashboard, Notion, Vercel) — مش نموذج HTML افتراضي بخط المتصفح العادي وجداول بيضاء بلا تصميم. لو الـ ui_guidelines خرج عام أو سطحي، اعتبره فشل في المهمة. تحديدًا:
- **حدد هوية بصرية فعلية تناسب طبيعة عمل العميل نفسه** (استنتجها من Business Model وExecutive Summary فوق) — منصة تعليمية غير منصة مالية غير منصة صحية غير متجر إلكتروني. سمّ فعليًا: لون أساسي واحد (Hex تقريبي)، ولون ثانوي/تمييز، ولوحة رمادية محايدة (Neutral Scale) للخلفيات والحدود والنصوص الثانوية، وألوان دلالية (نجاح/تحذير/خطأ/معلومة).
- **حدد نظام Typography**: خط أساسي واحد (زي Inter أو نظير له)، وسلّم أحجام واضح (Display/H1/H2/Body/Caption) بأوزان محددة.
- **حدد سلّم Spacing وRadius وShadow** ثابت يُستخدم في كل مكان (مش أرقام عشوائية لكل Component).
- **ممنوع أي عنصر بمظهر HTML افتراضي بلا تصميم**: لا Table بيضاء بحدود متصفح عادية، لا Input بدون Border/Focus State واضح، لا زرار رمادي افتراضي. كل جدول بيانات لازم يكون فيه: صفوف بفواصل واضحة أو تظليل خفيف (Zebra أو Hover)، حالات (Status) في شكل Badge/Pill ملوّن (مش نص عادي زي "PENDING" أو "PAID" مكتوب سادة)، وأزرار إجراء (Actions) بتصميم واضح.
- **كل شاشة رئيسية لازم توصف بصريًا بالتفصيل** — مش "صفحة فيها جدول"، لكن: العنوان وحجمه، الكروت/الأقسام وظلالها وحوافها المدوّرة، التباعد بين العناصر، شكل الأزرار الأساسية/الثانوية وحالاتها (Hover/Active/Disabled/Loading)، وترتيب المعلومات بصريًا حسب الأهمية.
- **حالات إلزامية لكل شاشة بيانات**: Empty State مصمم (أيقونة + رسالة + إجراء)، Loading State (Skeleton بأبعاد قريبة من المحتوى الحقيقي، مش Spinner وحيد بيدوّر في نص الصفحة)، Error State واضح، ونجاح العمليات عبر Toast/Inline Feedback مصمم مش alert() افتراضي.
- **Responsive فعليًا**: وصف واضح لسلوك كل شاشة رئيسية على الموبايل (مش بس "Responsive" كلمة عامة) — إيه اللي بيتخفي، إيه اللي بيتكدّس، الجدول بيتحول لإيه على الشاشات الضيقة.
- **Micro-interactions**: Transition خفيف على الـ Hover وفتح/غلق العناصر (Modals, Dropdowns)، مش انتقالات مفاجئة بلا Animation خالص.
- في technical_context: حدد صراحةً الأداة اللي هتحقق التصميم ده عمليًا (مثلاً Tailwind CSS مع Theme مخصص معرّف في نفس الملف، أو مكتبة Components زي shadcn/ui مبنية فوق Tailwind) — مش تكتفي بكلمة "Tailwind CSS" من غير تفاصيل الـ Theme.`;

const SECTION_SCHEMA_HINTS: Record<PrototypePromptSectionKey, string> = {
  context:
    "خلفية مختصرة عن المشروع والعميل (من Project Brain وPRD). وضّح إنه مشروع مستقل جديد، وحدد نوع نشاط العميل (تعليمي/مالي/صحي/تجاري/إلخ) بوضوح — ده هيحدد الهوية البصرية لاحقًا.",
  project_goal: "الهدف الأساسي من هذا الـ Prototype بجملة أو جملتين",
  technical_context:
    "احسم Stack واحد متسق صراحةً (Framework, Language, طبقة بيانات واحدة) وبنية المجلدات المتوقعة، وحدد أداة التصميم الفعلية (Tailwind + Theme مخصص، أو shadcn/ui فوق Tailwind) بالتفصيل — مش بس اسم المكتبة. ممنوع أي تعارض أو خيارين متنافسين لنفس الغرض.",
  required_features: "قائمة الـ Features الأساسية المطلوبة",
  functional_requirements: "كل الـ Functional Requirements من PRD كتعليمات تنفيذية",
  user_stories: "كل الـ User Stories من PRD بالكامل، بدون حذف ولا تلخيص",
  acceptance_criteria: "كل الـ Acceptance Criteria من PRD بصيغة Given/When/Then، بدون حذف",
  edge_cases: "حالات حدّية محتملة يجب التعامل معها (مبنية على المتطلبات)",
  constraints:
    "قيود تقنية أو زمنية أو نطاقية، وحدود رفع الملفات (النوع/الحجم/التحقق)، والتكاملات الخارجية كـ Mock صراحةً",
  out_of_scope: "ما لن يتم بناؤه في هذا الـ Prototype (من PRD)",
  architecture_notes:
    "بنية الملفات والطبقات + نماذج قاعدة البيانات + State Machine لكل حقل حالة + جدول صلاحيات RBAC (Role × مورد × إجراء) + شكل أي بيانات JSON منظمة",
  ui_guidelines:
    "نظام تصميم كامل ومفصّل بمستوى منتجات SaaS عالمية (راجع قسم قواعد التصميم تحت بالتفصيل): هوية بصرية مخصصة لنوع نشاط العميل (ألوان/Typography/Spacing/Radius/Shadow محددة بالاسم)، وصف بصري تفصيلي لكل شاشة رئيسية (كروت، جداول ببادجات ملوّنة للحالة، أزرار وحالاتها)، حالات فارغة/تحميل/خطأ مصممة (مش افتراضية)، سلوك Responsive محدد، Micro-interactions. ممنوع أي وصف عام أو سطحي.",
  code_quality_requirements: "معايير جودة الكود المتوقعة + Non-Functional Requirements (أداء/أمان/معالجة أخطاء)",
  testing_expectations: "التوقعات من ناحية الاختبار (لو مطلوب)",
  definition_of_done: "معايير اعتبار الـ Prototype جاهز ومكتمل، مقسّمة إلى مراحل مرقّمة (Milestones)",
};

/**
 * Prompt توليد كامل لـ Prototype Prompt — يعتمد فقط على PRD وProject
 * Brain (بدون Leads/Meetings/Discovery Forms مباشرة)، ويحقن إرشادات
 * الأداة المستهدفة من Template Manager.
 */
export function buildPrototypePromptGenerationPrompt(
  prd: PRD,
  brain: BrainContent,
  template: PromptTemplate
): string {
  const schemaEntries = Object.entries(SECTION_SCHEMA_HINTS)
    .map(([key, hint]) => `  "${key}": "${hint}"`)
    .join(",\n");

  return `أنت Senior Product Manager بتجهّز Execution-Ready Prompt هيُستخدم مباشرة من صاحب المشروع نفسه داخل أداة Coding Agent (زي Claude Code)، عبر جلسات تطوير متكررة وطويلة على نفس الكود بمرور الوقت — مش تسليم لمرة واحدة لفريق خارجي. اعتمادًا فقط على PRD المعتمد وProject Brain تحت. الهدف: prompt ينتج Prototype عالي الجودة بأقل تعديل يدوي ممكن، وبكود قابل للاستمرار والبناء عليه في الجلسات التالية.

${template.toolGuidance}

# بيانات PRD
${formatPRDContext(prd)}

# بيانات Project Brain
${formatBrainV2ForPrompt(brain)}

## المطلوب منك بالضبط
أرجع **JSON فقط** بـ 15 مفتاح بالضبط (بدون أي مفتاح إضافي أو مفقود):

{
${schemaEntries}
}

${STRICT_RULES}`;
}

/**
 * Prompt إعادة توليد قسم واحد بس من الـ Prompt الحالي.
 */
export function buildPrototypePromptSectionRegenerationPrompt(
  prd: PRD,
  brain: BrainContent,
  template: PromptTemplate,
  sectionKey: PrototypePromptSectionKey,
  currentSections: Record<string, string>
): string {
  return `أنت Senior Product Manager بتعيد كتابة قسم واحد بس من Prototype Prompt موجود، اعتمادًا على PRD وProject Brain وباقي الأقسام الحالية (للسياق فقط).

${template.toolGuidance}

# بيانات PRD
${formatPRDContext(prd)}

# بيانات Project Brain
${formatBrainV2ForPrompt(brain)}

# باقي أقسام الـ Prompt الحالية (للسياق فقط)
${JSON.stringify(currentSections, null, 2)}

## المطلوب منك بالضبط
أعد توليد القسم ده بس: **${sectionKey}** (${SECTION_SCHEMA_HINTS[sectionKey]})

أرجع **JSON فقط** بمفتاح واحد بالظبط:
{ "${sectionKey}": "..." }

${STRICT_RULES}`;
}
