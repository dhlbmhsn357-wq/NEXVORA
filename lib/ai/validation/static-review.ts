import type { StaticFindingSeverity, StaticReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";

const SEVERITIES: StaticFindingSeverity[] = ["critical", "high", "medium", "low", "info"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ParsedStaticFinding {
  title: string;
  severity: StaticFindingSeverity;
  description: string;
  impact: string;
  file_path: string;
  component_name: string | null;
  function_name: string | null;
  class_name: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string;
  root_cause: string;
  recommended_fix: string;
  patch_suggestion: string;
  validation_steps: string[];
  confidence_score: number;
}

function validateFinding(raw: unknown, index: number): { ok: true; value: ParsedStaticFinding } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: `Finding رقم ${index + 1} ليس كائنًا.` };
  }
  const f = raw as Record<string, unknown>;

  if (!isNonEmptyString(f.title)) return { ok: false, reason: `Finding رقم ${index + 1}: title مفقود.` };
  if (typeof f.severity !== "string" || !SEVERITIES.includes(f.severity as StaticFindingSeverity)) {
    return { ok: false, reason: `Finding رقم ${index + 1}: severity غير صالح.` };
  }
  if (!isNonEmptyString(f.description)) return { ok: false, reason: `Finding رقم ${index + 1}: description مفقود.` };
  if (!isNonEmptyString(f.impact)) return { ok: false, reason: `Finding رقم ${index + 1}: impact مفقود.` };
  if (!isNonEmptyString(f.file_path)) return { ok: false, reason: `Finding رقم ${index + 1}: file_path مفقود.` };
  if (!isNonEmptyString(f.code_snippet)) {
    return { ok: false, reason: `Finding رقم ${index + 1}: code_snippet مفقود — كل Finding لازم دليل حرفي من الكود.` };
  }
  if (!isNonEmptyString(f.root_cause)) return { ok: false, reason: `Finding رقم ${index + 1}: root_cause مفقود.` };
  if (!isNonEmptyString(f.recommended_fix)) return { ok: false, reason: `Finding رقم ${index + 1}: recommended_fix مفقود.` };
  if (!Array.isArray(f.validation_steps) || !f.validation_steps.every((s) => typeof s === "string")) {
    return { ok: false, reason: `Finding رقم ${index + 1}: validation_steps لازم يكون مصفوفة نصوص.` };
  }

  const lineStart = f.line_start === null || f.line_start === undefined ? null : Number(f.line_start);
  const lineEnd = f.line_end === null || f.line_end === undefined ? null : Number(f.line_end);
  if (lineStart !== null && !Number.isFinite(lineStart)) {
    return { ok: false, reason: `Finding رقم ${index + 1}: line_start غير صالح.` };
  }
  if (lineEnd !== null && !Number.isFinite(lineEnd)) {
    return { ok: false, reason: `Finding رقم ${index + 1}: line_end غير صالح.` };
  }

  const confidence = Number(f.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, reason: `Finding رقم ${index + 1}: confidence_score لازم يكون رقم بين 0 و100.` };
  }

  return {
    ok: true,
    value: {
      title: f.title as string,
      severity: f.severity as StaticFindingSeverity,
      description: f.description as string,
      impact: f.impact as string,
      file_path: f.file_path as string,
      component_name: isNonEmptyString(f.component_name) ? f.component_name : null,
      function_name: isNonEmptyString(f.function_name) ? f.function_name : null,
      class_name: isNonEmptyString(f.class_name) ? f.class_name : null,
      line_start: lineStart,
      line_end: lineEnd,
      code_snippet: f.code_snippet as string,
      root_cause: f.root_cause as string,
      recommended_fix: f.recommended_fix as string,
      patch_suggestion: isNonEmptyString(f.patch_suggestion) ? f.patch_suggestion : "",
      validation_steps: f.validation_steps as string[],
      confidence_score: Math.round(confidence),
    },
  };
}

export type CategoryReviewValidationResult =
  | { ok: true; data: { summary: string; findings: ParsedStaticFinding[] } }
  | { ok: false; reason: string };

/**
 * يتحقق من رد تدقيق محور واحد: JSON صالح، summary موجود، وكل Finding
 * بالشكل الصحيح. التحقق من إن الأدلة حقيقية فعليًا (مش مختلقة) بيحصل
 * في verifyFindingsGrounding بعد كده، مش هنا.
 */
export function validateCategoryReview(raw: string | null): CategoryReviewValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const obj = parsed as Record<string, unknown>;
  if (!isNonEmptyString(obj.summary)) return { ok: false, reason: "summary مفقود." };
  if (!Array.isArray(obj.findings)) return { ok: false, reason: "findings لازم يكون مصفوفة." };

  const findings: ParsedStaticFinding[] = [];
  for (let i = 0; i < obj.findings.length; i++) {
    const result = validateFinding(obj.findings[i], i);
    if (!result.ok) return { ok: false, reason: result.reason };
    findings.push(result.value);
  }

  return { ok: true, data: { summary: obj.summary, findings } };
}

/**
 * حارس أمان إضافي على مستوى الكود: أي Finding بيشير لملف مش موجود
 * فعليًا في الملفات اللي اتبعتت للـ AI، أو code_snippet مش موجود
 * حرفيًا (بعد تطبيع المسافات) جوّه محتوى الملف ده، بيتشال بهدوء.
 */
export function verifyFindingsGrounding(
  findings: ParsedStaticFinding[],
  files: RepoFile[]
): { grounded: ParsedStaticFinding[]; droppedCount: number } {
  const contentByPath = new Map(files.map((f) => [f.path, f.content]));
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

  const grounded = findings.filter((finding) => {
    const content = contentByPath.get(finding.file_path);
    if (!content) return false;
    const snippet = normalize(finding.code_snippet);
    if (snippet.length === 0) return false;
    return normalize(content).includes(snippet);
  });

  return { grounded, droppedCount: findings.length - grounded.length };
}

/**
 * مفتاح ثابت (Stable Key) لكل Finding — بيُستخدم للمقارنة بين مراجعتين
 * (Issues Added/Fixed/Remaining) بدل الاعتماد على UUID عشوائي بيتغيّر
 * كل مرة. مبني على category + file_path + عنوان مُطبَّع (lowercase،
 * مسافات موحّدة) — مش Hash تشفيري، مجرد مفتاح نصي حتمي وقابل للمقارنة
 * المباشرة. القيد المعروف: لو الـ AI غيّر صياغة العنوان بين مراجعتين
 * لنفس المشكلة بالظبط، هيتحسب كـ "Finding جديد" بدل "نفس القديم" —
 * تريد-أوف مقبول بدل نظام مطابقة دلالي معقد يحتاج استدعاء AI إضافي.
 */
export function computeFindingKey(categoryKey: StaticReviewCategoryKey, filePath: string, title: string): string {
  const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${categoryKey}::${filePath}::${normalizedTitle}`;
}

const SEVERITY_PENALTY: Record<StaticFindingSeverity, number> = {
  critical: 20,
  high: 10,
  medium: 4,
  low: 1.5,
  info: 0.5,
};

/**
 * درجة المحور (0-100) — بتتحسب حسابيًا من قائمة الـ Findings النهائية
 * (الجديدة + المنقولة من مراجعات سابقة)، مش بيطلب من الـ AI يخترع رقم.
 * القرار ده مقصود: تحت التحليل التدريجي، الـ AI بيشوف بس الملفات
 * المتغيّرة في كل مراجعة، فمينفعش يديله مسؤولية درجة شاملة للمحور كله
 * كل مرة — الدرجة الحسابية ثابتة المقياس بغض النظر عن حجم التغيير.
 */
export function computeCategoryScore(findings: { severity: StaticFindingSeverity }[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
