import type { StaticReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";

function formatRepoFiles(files: RepoFile[]): string {
  return files.map((f) => `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}

/**
 * إرشادات كل محور — نفس الـ 7 محاور المطلوبة صراحةً في السبيك (Phase
 * 12.2)، كل واحد منفصل بدون دمج، بالنطاق التفصيلي اللي المستخدم حدده.
 */
const CATEGORY_GUIDANCE: Record<StaticReviewCategoryKey, { title: string; focus: string }> = {
  architecture: {
    title: "Architecture Audit",
    focus: `راجع: Project Structure, Folder Hierarchy, Module Boundaries, Dependency Direction, Feature Isolation, Shared Components, Layer Separation, Feature Coupling, Package Organization, Scalability, Architecture Consistency, Feature Boundaries, Code Ownership.
معاك تحت شجرة كل ملفات المشروع (أسماء بس) عشان تقيّم البنية الكاملة، لكن الأدلة الحرفية (code_snippet) لازم تيجي بس من الملفات اللي معاك محتواها الكامل. أي انحراف عن نمط المعمارية السائد في المشروع (زي مجلد Feature منظّم بشكل مختلف عن باقي الـ Features) يجب الإبلاغ عنه.`,
  },
  clean_code: {
    title: "Clean Code Audit",
    focus: `راجع: Function Size, Component Size, Cyclomatic Complexity, Nested Conditions, Duplicate Logic, Magic Numbers, Magic Strings, Unused Variables, Unused Imports, Unused Components, Long Parameter Lists, Long Functions, Large Files, Large Classes, Repeated Patterns, Dead Code, Poor Naming, Over Commenting, Missing Comments عند المنطق المعقد, Code Readability, Maintainability.`,
  },
  solid: {
    title: "SOLID Audit",
    focus: `حلّل التزام الكود بـ: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion. لكل مخالفة، اشرح بالتحديد أي مبدأ اتخالف وليه (مش وصف عام) مع دليل الكود.`,
  },
  dry_kiss: {
    title: "DRY / KISS Audit",
    focus: `راجع: Duplicate Logic, Repeated Components, Repeated Queries, Repeated Validation, Over Engineering, Under Engineering, Unnecessary Abstraction, Over Nested Logic, Separation of Concerns.
تحقق تحديدًا من الفصل بين: UI, Business Logic, Database, External Services, AI Layer, Configuration, Utilities — أي خلط بين الطبقات دي (مثلاً استعلام قاعدة بيانات جوّه Component، أو منطق عمل جوّه طبقة UI) يُسجَّل كـ Finding.`,
  },
  ai_code_smell: {
    title: "AI Generated Code Audit",
    focus: `المشروع ده بيتطوّر باستخدام الذكاء الاصطناعي — دورك تكتشف الأنماط اللي بتدل على ضعف جودة كود مُولَّد بالذكاء الاصطناعي تحديدًا، مش مجرد كود سيء عادي. دور على: God Components, Monolithic Files, Massive Services, Massive Hooks, Copy Paste, Generic Naming, Hallucinated Utilities (دوال/utilities اتعملت لحاجة موجودة بالفعل بشكل تاني), Over Generated Types, Unused Layers, Over Engineered Patterns, Artificial Abstractions, Context Abuse, Prop Drilling, Hidden Dependencies, Large Switch Statements, Massive Conditional Trees, Artificial Wrappers, Boilerplate Explosion.
لكل Finding من دول، وضّح في description ليه بالتحديد بتعتبره نمط من أنماط AI Code Smell (مش مجرد "الكود طويل") — مثلاً "الملف ده بيجمع 4 مسؤوليات غير مرتبطة في مكان واحد، نمط شائع لما AI بيتوسّع في ملف موجود بدل ما يقسّمه".`,
  },
  naming: {
    title: "Naming Convention Audit",
    focus: `راجع تسمية: Files, Folders, Functions, Variables, Interfaces, Types, Enums, Components, Hooks, Services, Routes, Database Queries. قارن كل اسم مع نمط التسمية السائد في باقي ملفات المشروع المرفقة (لو أغلب الملفات بتستخدم camelCase للدوال وPascalCase للـ Components، أي انحراف عن كده Finding). ما تخترعش "المعيار المثالي" من الصفر — قارن بالنمط الفعلي الموجود.`,
  },
  documentation: {
    title: "Documentation Audit",
    focus: `تحقق من: وجود Documentation عند الحاجة (قرارات معمارية معقدة، منطق عمل غير بديهي)، عدم وجود تعليقات غير مفيدة (بتشرح الواضح بدل الغامض)، وضوح أسماء الدوال والـ Interfaces (تقدر تفهم الغرض من الاسم بدون قراءة الكود جواه).`,
  },
};

const FINDING_SCHEMA = `{
  "title": "عنوان مختصر للمشكلة",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "description": "شرح تفصيلي للمشكلة",
  "impact": "الأثر الفعلي على المشروع لو المشكلة دي فضلت من غير حل",
  "file_path": "المسار الحقيقي بالظبط زي ما ظهر في \\"### File: ...\\" فوق",
  "component_name": "اسم الـ Component لو منطبق، أو null",
  "function_name": "اسم الدالة/الـ Method لو منطبق، أو null",
  "class_name": "اسم الـ Class لو موجود، أو null",
  "line_start": <رقم السطر الأول من الكود المقتبس تحت، عدد صحيح، أو null لو مش معروف بدقة>,
  "line_end": <رقم السطر الأخير، أو null>,
  "code_snippet": "اقتباس حرفي 100% من الكود المرفق فوق (سطر لحد 15 سطر) — ممنوع تختلق كود مش موجود في الملفات المرفقة",
  "root_cause": "السبب الجذري الحقيقي (مش وصف الأعراض)",
  "recommended_fix": "شرح دقيق وقابل للتنفيذ فورًا للحل",
  "patch_suggestion": "مثال كود مختصر (Snippet) يوضّح شكل الحل المقترح",
  "validation_steps": ["خطوة للتأكد إن الإصلاح نجح", "..."],
  "confidence_score": <0-100 — درجة ثقتك في إن ده Finding حقيقي ومش تخمين>
}`;

const STRICT_RULES = `قواعد صارمة (إلزامية 100%):
- تصرّف كمراجع هندسي (Reviewer) مش كمولّد كود — دورك تكتشف مشاكل موجودة فعليًا، مش تقترح إعادة كتابة كاملة.
- لا تخترع مشاكل، ولا تجامل. لو الكود في المحور ده نضيف فعلاً، أرجع findings فاضية وsummary بيقول كده صراحة.
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- ممنوع منعًا باتًا أي Finding من غير code_snippet مقتبس حرفيًا من الملفات المرفقة فوق — لو مش لاقي دليل حرفي في الكود، متكتبش الـ Finding خالص. ممنوع الافتراض أو التخمين.
- file_path لازم يطابق بالظبط أحد الملفات المذكورة في "### File: ..." فوق — ممنوع اختراع مسار غير موجود.
- لو مش متأكد من رقم السطر بدقة، سيب line_start/line_end = null بدل ما تختلق رقم — بس code_snippet لازم يفضل حرفي دايمًا.
- لو مش متأكد إن ده Finding حقيقي، اذكر ده بوضوح في confidence_score (رقم منخفض) بدل ما تحذفه أو تتجاهله.
- ركّز على أهم 5-15 Finding حقيقي في المحور ده بس — الأهم إن كل Finding يكون حقيقي ومدعوم بدليل، مش كمية بدون جودة.
- كل النصوص بالعربية الفصحى الاحترافية، إلا الأسماء التقنية (file_path, component_name, function_name, class_name, code_snippet, patch_suggestion) تفضل زي ما هي بالإنجليزية/الكود الأصلي.`;

/**
 * Prompt تدقيق محور واحد من محاور Static Architecture Review. لمحور
 * architecture تحديدًا بنرفق شجرة الملفات الكاملة (أسماء بس) كسياق
 * بنيوي إضافي، حتى لو التحليل تدريجي ومحتوى الملفات المرفق هو الفرق بس.
 */
export function buildCategoryReviewPrompt(
  categoryKey: StaticReviewCategoryKey,
  files: RepoFile[],
  fileTree: string[],
  isIncremental: boolean
): string {
  const guidance = CATEGORY_GUIDANCE[categoryKey];
  const treeSection =
    categoryKey === "architecture"
      ? `\n# شجرة كل ملفات المشروع القابلة للمراجعة (${fileTree.length} ملف — أسماء بس، للسياق البنيوي الكامل)\n${fileTree.join("\n")}\n`
      : "";
  const incrementalNote = isIncremental
    ? `\nملاحظة: هذه مراجعة تدريجية (Incremental) — الملفات المرفقة تحت هي بس اللي اتغيّرت أو اتضافت من آخر مراجعة. ملفات لم تتغيّر ومشاكلها القديمة لسه محفوظة تلقائيًا (مش مطلوب منك تكتشفها تاني).\n`
    : "";

  return `أنت Staff Software Engineer بتعمل Code Review هندسي عميق مبني على أدلة حقيقية 100% لمحور واحد بس من محاور المراجعة: **${guidance.title}**.
${incrementalNote}${treeSection}
# ملفات الكود المصدري الفعلية (${files.length} ملف) — المصدر الوحيد المسموح بيه للأدلة
${formatRepoFiles(files)}

## نطاق التدقيق المطلوب لهذا المحور تحديدًا
${guidance.focus}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

{
  "summary": "ملخص عام لحالة المحور ده في المشروع (فقرة إلى فقرتين)",
  "findings": [${FINDING_SCHEMA}]
}

${STRICT_RULES}`;
}
