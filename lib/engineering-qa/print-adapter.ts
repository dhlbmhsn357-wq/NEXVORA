import { createServiceClient } from "@/lib/supabase/service";
import { getStageDefinition } from "./stage-registry";
import { isPrintableStage } from "./print-registry-keys";
import { StaticReviewEngine } from "@/lib/static-review/generation-service";
import { SecurityReviewEngine } from "@/lib/security-review/generation-service";
import { DatabaseReviewEngine } from "@/lib/database-review/generation-service";
import { ArchitectureReviewEngine } from "@/lib/architecture-review/generation-service";
import { CodeQualityReviewEngine } from "@/lib/code-quality-review/generation-service";
import { PerformanceReviewEngine } from "@/lib/performance-review/generation-service";
import { PrdComplianceReviewEngine } from "@/lib/prd-compliance-review/generation-service";
import type {
  StaticReviewFinding,
  SecurityReviewFinding,
  DatabaseReviewFinding,
  ArchitectureReviewFinding,
  CodeQualityReviewFinding,
  PerformanceReviewFinding,
  PrdComplianceReviewFinding,
} from "@/lib/types/database";

/**
 * محوّل تصدير PDF لمراحل Engineering QA — نقطة تجميع واحدة بتقرأ نتيجة
 * أي مرحلة (7 محركات مختلفة، كل واحد بجدوله وشكل Finding الخاص بيه) وتطلّعها
 * بشكل موحّد (PrintFinding) للصفحة القابلة للطباعة. صفر جداول/تخزين جديد —
 * بيستخدم getReviewWithFindings() الموجودة بالفعل في كل Engine.
 *
 * StaticReviewFinding و PhaseAuditFindingBase (أساس الـ 6 محركات التانية)
 * متطابقين في كل الحقول تقريبًا ما عدا attack_scenario/reference_links
 * (موجودين بس في الـ 6 التانية) — عشان كده PrintFinding بتعاملهم كحقول
 * اختيارية بدل ما تعمل نوعين منفصلين للمحوّل.
 */

export interface PrintFinding {
  severity: string;
  title: string;
  filePath: string;
  lineStart: number | null;
  lineEnd: number | null;
  categoryKey: string;
  description: string;
  impact: string;
  rootCause: string;
  recommendedFix: string;
  patchSuggestion: string;
  validationSteps: string[];
  codeSnippet: string;
  attackScenario: string | null;
  referenceLinks: string[];
  confidenceScore: number;
  carriedOver: boolean;
}

export interface PrintReviewData {
  stageKey: string;
  stageLabel: string;
  projectId: string;
  reviewId: string;
  version: number;
  status: string;
  generatedAt: string | null;
  scoreSummary: Record<string, number> | null;
  findings: PrintFinding[];
}

type AnyFinding =
  | StaticReviewFinding
  | SecurityReviewFinding
  | DatabaseReviewFinding
  | ArchitectureReviewFinding
  | CodeQualityReviewFinding
  | PerformanceReviewFinding
  | PrdComplianceReviewFinding;

function normalizeFinding(f: AnyFinding): PrintFinding {
  const withOptional = f as AnyFinding & { attack_scenario?: string; reference_links?: string[] };
  return {
    severity: f.severity,
    title: f.title,
    filePath: f.file_path,
    lineStart: f.line_start,
    lineEnd: f.line_end,
    categoryKey: f.category_key,
    description: f.description,
    impact: f.impact,
    rootCause: f.root_cause,
    recommendedFix: f.recommended_fix,
    patchSuggestion: f.patch_suggestion,
    validationSteps: f.validation_steps ?? [],
    codeSnippet: f.code_snippet,
    attackScenario: withOptional.attack_scenario ?? null,
    referenceLinks: withOptional.reference_links ?? [],
    confidenceScore: f.confidence_score,
    carriedOver: f.carried_over,
  };
}

type Adapter = (reviewId: string) => Promise<Omit<PrintReviewData, "stageKey" | "stageLabel"> | null>;

const ADAPTERS: Record<string, Adapter> = {
  static_code_audit: async (reviewId) => {
    const data = await StaticReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
  security_audit: async (reviewId) => {
    const data = await SecurityReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
  database_audit: async (reviewId) => {
    const data = await DatabaseReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
  architecture_audit: async (reviewId) => {
    const data = await ArchitectureReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
  code_quality_audit: async (reviewId) => {
    const data = await CodeQualityReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
  performance_audit: async (reviewId) => {
    const data = await PerformanceReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
  prd_compliance_audit: async (reviewId) => {
    const data = await PrdComplianceReviewEngine.getReviewWithFindings(reviewId);
    if (!data) return null;
    return {
      projectId: data.review.project_id,
      reviewId,
      version: data.review.version,
      status: data.review.status,
      generatedAt: data.review.generated_at,
      scoreSummary: (data.review.score_summary as unknown as Record<string, number>) ?? null,
      findings: data.findings.map(normalizeFinding),
    };
  },
};

export { isPrintableStage };

export async function getStagePrintData(stageKey: string, reviewId: string): Promise<PrintReviewData | null> {
  const adapter = ADAPTERS[stageKey];
  const stageDef = getStageDefinition(stageKey);
  if (!adapter || !stageDef) return null;
  const data = await adapter(reviewId);
  if (!data) return null;
  return { ...data, stageKey, stageLabel: stageDef.label };
}

export async function getProjectNameForPrint(projectId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  return data?.name ?? "مشروع";
}
