/**
 * نموذج تقرير جودة المعرفة الموحّد — **وحدة نقية بلا I/O**.
 *
 * ## البناء فوق الموجود
 *
 * `quality.ts` بيحسب ٥ أبعاد بالفعل. ده **مايكرّرهاش** — بياخد نتائجها
 * + فحوصات إضافية (تعارضات، علاقات مكسورة، بيانات حسّاسة) ويجمّعها في
 * **تقرير موحّد** بمشاكل مصنّفة قابلة للفعل ودرجة كلية واحدة.
 *
 * الفرق بين ده و`quality.ts`: الأخير **درجة**؛ ده **تقرير** — قائمة
 * مشاكل محدَّدة مع مراجعها، جاهزة للعرض والمعالجة.
 */

export type QaIssueType =
  | "incompleteness"
  | "inconsistency"
  | "contradiction"
  | "broken_relation"
  | "missing_metadata"
  | "low_confidence"
  | "duplicate"
  | "staleness"
  | "sensitive_data";

export type QaSeverity = "critical" | "high" | "medium" | "low";

export const QA_ISSUE_LABELS: Record<QaIssueType, string> = {
  incompleteness: "نقص اكتمال",
  inconsistency: "عدم اتساق",
  contradiction: "تعارض",
  broken_relation: "علاقة مكسورة",
  missing_metadata: "بيانات وصفية ناقصة",
  low_confidence: "ثقة منخفضة",
  duplicate: "تكرار",
  staleness: "تقادم",
  sensitive_data: "بيانات حسّاسة",
};

export interface QaIssue {
  type: QaIssueType;
  severity: QaSeverity;
  detail: string;
  /** مرجع الكائن المعني، اختياري. */
  ref?: string;
}

const SEVERITY_WEIGHT: Record<QaSeverity, number> = {
  critical: 12,
  high: 6,
  medium: 3,
  low: 1,
};

export interface QaInput {
  /** درجة الجودة الكلية من computeQuality (٠–١٠٠). */
  qualityOverall: number;
  /** أبعاد الجودة الخمسة من computeQuality. */
  dimensions: Record<string, number>;
  issues: QaIssue[];
  /** عدد الكائنات اللي فيها بيانات حسّاسة محتملة. */
  piiFlagCount: number;
}

export interface QaReport {
  overallScore: number;
  dimensions: Record<string, number>;
  issues: QaIssue[];
  issueCount: number;
  criticalCount: number;
  piiFlagCount: number;
}

/**
 * يبني التقرير الموحّد.
 *
 * الدرجة الكلية = درجة الجودة الأساسية **مطروحًا منها** عقوبة المشاكل
 * الموزونة بالشدّة (متشبّعة عند حدّ). ده بيخلّي تقرير فيه تعارض حرج
 * يخصم أكتر من تقرير فيه عشر ملاحظات صغيرة — والعكس اللي كان بيحصل لو
 * عدّينا المشاكل بالتساوي.
 */
export function buildQaReport(input: QaInput): QaReport {
  const penalty = input.issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  // التشبّع: أقصى خصم ٤٠ نقطة مهما تراكمت المشاكل — تقرير سيّئ يبقى
  // سيّئًا، لكن لا يهبط لصفر ويخفي التحسّن النسبي.
  const cappedPenalty = Math.min(40, penalty);
  const overallScore = Math.max(0, Math.min(100, Math.round(input.qualityOverall - cappedPenalty)));

  return {
    overallScore,
    dimensions: input.dimensions,
    issues: [...input.issues].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]),
    issueCount: input.issues.length,
    criticalCount: input.issues.filter((i) => i.severity === "critical").length,
    piiFlagCount: input.piiFlagCount,
  };
}

export function qaVerdict(score: number): "pass" | "warn" | "fail" {
  if (score >= 75) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

export const QA_VERDICT_LABELS: Record<ReturnType<typeof qaVerdict>, string> = {
  pass: "مجتاز",
  warn: "يحتاج انتباهًا",
  fail: "غير مجتاز",
};
