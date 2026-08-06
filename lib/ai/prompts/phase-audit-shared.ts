import type { RepoFile } from "@/lib/github/repo-reader";

/**
 * بناء Prompt مشترك بين Security Audit Engine وDatabase Integrity
 * Engine — نفس شكل الـ Finding ونفس القواعد الصارمة، الفرق بس في
 * الـ Persona ونطاق كل محور (بيتحدد في lib/security-review/prompts.ts
 * وlib/database-review/prompts.ts).
 */

export function formatRepoFilesForPrompt(files: RepoFile[]): string {
  return files.map((f) => `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}

const FINDING_SCHEMA = `{
  "title": "عنوان مختصر للمشكلة",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "description": "شرح تفصيلي للمشكلة",
  "impact": "الأثر الفعلي لو المشكلة دي فضلت من غير حل",
  "file_path": "المسار الحقيقي بالظبط زي ما ظهر في \\"### File: ...\\" فوق",
  "component_name": "اسم الـ Component لو منطبق، أو null",
  "function_name": "اسم الدالة/الـ Method لو منطبق، أو null",
  "class_name": "اسم الـ Class لو موجود، أو null",
  "line_start": <رقم السطر الأول من الكود المقتبس تحت، عدد صحيح، أو null لو مش معروف بدقة>,
  "line_end": <رقم السطر الأخير، أو null>,
  "code_snippet": "اقتباس حرفي 100% من الكود المرفق فوق (سطر لحد 15 سطر) — ممنوع تختلق كود مش موجود في الملفات المرفقة",
  "root_cause": "السبب الجذري الحقيقي (مش وصف الأعراض)",
  "attack_scenario": "لو ثغرة أمنية فعلية: إزاي ممكن تُستغل عمليًا خطوة بخطوة. لو مشكلة قاعدة بيانات/جودة كود: سيناريو الفشل الواقعي (إيه اللي ممكن يحصل غلط). سيبها فاضية لو مش منطبقة.",
  "recommended_fix": "شرح دقيق وقابل للتنفيذ فورًا للحل",
  "patch_suggestion": "مثال كود مختصر يوضّح شكل الحل المقترح",
  "validation_steps": ["خطوة للتأكد إن الإصلاح نجح", "..."],
  "reference_links": ["OWASP/CWE/توثيق رسمي متعلق بالمشكلة، أو مصفوفة فاضية لو مفيش"],
  "confidence_score": <0-100 — درجة ثقتك في إن ده Finding حقيقي ومش تخمين>
}`;

const STRICT_RULES = `قواعد صارمة (إلزامية 100%):
- تصرّف كمراجع (Reviewer) مش كمولّد كود — دورك تكتشف مشاكل موجودة فعليًا، مش تقترح إعادة كتابة كاملة.
- لا تخترع مشاكل، ولا تجامل. لو مفيش مشاكل حقيقية في المحور ده، أرجع findings فاضية وsummary بيقول كده صراحة.
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- ممنوع منعًا باتًا أي Finding من غير code_snippet مقتبس حرفيًا من الملفات المرفقة فوق — لو مش لاقي دليل حرفي في الكود، متكتبش الـ Finding خالص. ممنوع الافتراض أو التخمين.
- file_path لازم يطابق بالظبط أحد الملفات المذكورة في "### File: ..." فوق — ممنوع اختراع مسار غير موجود.
- لو مش متأكد من رقم السطر بدقة، سيب line_start/line_end = null بدل ما تختلق رقم — بس code_snippet لازم يفضل حرفي دايمًا.
- لو مش متأكد إن ده Finding حقيقي، اذكر ده بوضوح في confidence_score (رقم منخفض) بدل ما تحذفه أو تتجاهله.
- ركّز على أهم 5-15 Finding حقيقي في المحور ده بس — الأهم إن كل Finding يكون حقيقي ومدعوم بدليل، مش كمية بدون جودة.
- كل النصوص بالعربية الفصحى الاحترافية، إلا الأسماء التقنية (file_path, component_name, function_name, class_name, code_snippet, patch_suggestion) تفضل زي ما هي بالإنجليزية/الكود الأصلي.`;

export function buildPhaseCategoryPrompt(options: {
  persona: string;
  categoryTitle: string;
  categoryFocus: string;
  files: RepoFile[];
  fileTree?: string[];
  fileTreeLabel?: string;
  isIncremental: boolean;
}): string {
  const treeSection = options.fileTree
    ? `\n# ${options.fileTreeLabel ?? "شجرة ملفات المشروع"} (${options.fileTree.length} ملف — أسماء بس، للسياق الكامل)\n${options.fileTree.join("\n")}\n`
    : "";
  const incrementalNote = options.isIncremental
    ? `\nملاحظة: هذه مراجعة تدريجية (Incremental) — الملفات المرفقة تحت هي بس اللي اتغيّرت أو اتضافت من آخر مراجعة، أو الملفات اللي محورك ده بيهتم بيها تحديدًا. ملفات لم تتغيّر ومشاكلها القديمة لسه محفوظة تلقائيًا.\n`
    : "";

  return `${options.persona}
${incrementalNote}${treeSection}
# ملفات الكود المصدري الفعلية (${options.files.length} ملف) — المصدر الوحيد المسموح بيه للأدلة
${formatRepoFilesForPrompt(options.files)}

## نطاق التدقيق المطلوب لهذا المحور تحديدًا: ${options.categoryTitle}
${options.categoryFocus}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط:

{
  "summary": "ملخص عام لحالة المحور ده في المشروع (فقرة إلى فقرتين)",
  "findings": [${FINDING_SCHEMA}]
}

${STRICT_RULES}`;
}
