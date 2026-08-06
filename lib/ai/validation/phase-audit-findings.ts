import type { AuditFindingSeverity } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";

/**
 * تحقّق وتقييم مشترك بين Security Audit Engine وDatabase Integrity
 * Engine (Phase 12.3) — شكل الـ Finding مطابق تمامًا بين المحركين
 * (راجع PhaseAuditFindingBase في lib/types/database.ts)، فبدل ما يتكرر
 * نفس منطق التحقق والتصحيح والدرجة في ملفين، الملف ده مشترك بينهم.
 * مقصود إنه ملف واحد يخدم محركين (مش انتهاك لـ Single Responsibility —
 * مسؤوليته الوحيدة هي "التحقق من شكل Finding واحد موحّد"، والمحركين
 * نفسهم مستقلين تمامًا في كل حاجة تانية).
 */

const SEVERITIES: AuditFindingSeverity[] = ["critical", "high", "medium", "low", "info"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ParsedPhaseFinding {
  title: string;
  severity: AuditFindingSeverity;
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
  attack_scenario: string;
  recommended_fix: string;
  patch_suggestion: string;
  validation_steps: string[];
  reference_links: string[];
  confidence_score: number;
}

function validateFinding(raw: unknown, index: number): { ok: true; value: ParsedPhaseFinding } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: `Finding رقم ${index + 1} ليس كائنًا.` };
  }
  const f = raw as Record<string, unknown>;

  if (!isNonEmptyString(f.title)) return { ok: false, reason: `Finding رقم ${index + 1}: title مفقود.` };
  if (typeof f.severity !== "string" || !SEVERITIES.includes(f.severity as AuditFindingSeverity)) {
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
  if (f.reference_links !== undefined && (!Array.isArray(f.reference_links) || !f.reference_links.every((s) => typeof s === "string"))) {
    return { ok: false, reason: `Finding رقم ${index + 1}: reference_links لازم يكون مصفوفة نصوص.` };
  }

  const lineStart = f.line_start === null || f.line_start === undefined ? null : Number(f.line_start);
  const lineEnd = f.line_end === null || f.line_end === undefined ? null : Number(f.line_end);
  if (lineStart !== null && !Number.isFinite(lineStart)) return { ok: false, reason: `Finding رقم ${index + 1}: line_start غير صالح.` };
  if (lineEnd !== null && !Number.isFinite(lineEnd)) return { ok: false, reason: `Finding رقم ${index + 1}: line_end غير صالح.` };

  const confidence = Number(f.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, reason: `Finding رقم ${index + 1}: confidence_score لازم يكون رقم بين 0 و100.` };
  }

  return {
    ok: true,
    value: {
      title: f.title as string,
      severity: f.severity as AuditFindingSeverity,
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
      attack_scenario: isNonEmptyString(f.attack_scenario) ? f.attack_scenario : "",
      recommended_fix: f.recommended_fix as string,
      patch_suggestion: isNonEmptyString(f.patch_suggestion) ? f.patch_suggestion : "",
      validation_steps: f.validation_steps as string[],
      reference_links: (f.reference_links as string[] | undefined) ?? [],
      confidence_score: Math.round(confidence),
    },
  };
}

export type PhaseCategoryReviewValidationResult =
  | { ok: true; data: { summary: string; findings: ParsedPhaseFinding[] } }
  | { ok: false; reason: string };

export function validatePhaseCategoryReview(raw: string | null): PhaseCategoryReviewValidationResult {
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

  const findings: ParsedPhaseFinding[] = [];
  for (let i = 0; i < obj.findings.length; i++) {
    const result = validateFinding(obj.findings[i], i);
    if (!result.ok) return { ok: false, reason: result.reason };
    findings.push(result.value);
  }

  return { ok: true, data: { summary: obj.summary, findings } };
}

/** حارس دليل حقيقي — نفس منطق Static Review بالظبط، مشترك هنا لتفادي التكرار بين المحركين. */
export function verifyPhaseFindingsGrounding(
  findings: ParsedPhaseFinding[],
  files: RepoFile[]
): { grounded: ParsedPhaseFinding[]; droppedCount: number } {
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

export function computePhaseFindingKey(categoryKey: string, filePath: string, title: string): string {
  const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${categoryKey}::${filePath}::${normalizedTitle}`;
}

const SEVERITY_PENALTY: Record<AuditFindingSeverity, number> = {
  critical: 20,
  high: 10,
  medium: 4,
  low: 1.5,
  info: 0.5,
};

/** نفس صيغة Static Review's computeCategoryScore بالظبط — مشتركة هنا بين Security وDatabase. */
export function computePhaseCategoryScore(findings: { severity: AuditFindingSeverity }[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
