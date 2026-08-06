/**
 * مُتحقّق مخرَج تحقّق محاكاة الترحيل — نمط صارم. طبقة استشارية لا تلغي
 * الحكم الحتمي (Approval Score) بل تُثريه بالتفسير.
 */

export interface SimRiskPrediction {
  title: string;
  level: "low" | "medium" | "high" | "critical";
  reason: string;
  mitigation: string;
}

export interface SimValidationData {
  executive_summary: string;
  business_consistency: { verdict: "consistent" | "minor_issues" | "inconsistent"; findings: string[] };
  risk_prediction: SimRiskPrediction[];
  recommendations: string[];
  go_no_go: "go" | "conditional_go" | "no_go";
}

export type SimValidation = { ok: true; data: SimValidationData } | { ok: false; reason: string };

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}

const LEVELS = new Set(["low", "medium", "high", "critical"]);
const VERDICTS = new Set(["consistent", "minor_issues", "inconsistent"]);
const GONOGO = new Set(["go", "conditional_go", "no_go"]);

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 30) : [];
}

export function validateSimulationValidation(raw: string | null): SimValidation {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "مخرَج فارغ." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "JSON غير صالح." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "المخرَج ليس كائنًا." };
  const o = parsed as Record<string, unknown>;

  const bc = (o.business_consistency ?? {}) as Record<string, unknown>;
  const verdict = typeof bc.verdict === "string" && VERDICTS.has(bc.verdict) ? (bc.verdict as SimValidationData["business_consistency"]["verdict"]) : "minor_issues";

  const risks: SimRiskPrediction[] = Array.isArray(o.risk_prediction)
    ? (o.risk_prediction as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((r) => ({
          title: typeof r.title === "string" ? r.title.trim() : "",
          level: typeof r.level === "string" && LEVELS.has(r.level) ? (r.level as SimRiskPrediction["level"]) : "medium",
          reason: typeof r.reason === "string" ? r.reason.trim() : "",
          mitigation: typeof r.mitigation === "string" ? r.mitigation.trim() : "",
        }))
        .filter((r) => r.title)
        .slice(0, 30)
    : [];

  return {
    ok: true,
    data: {
      executive_summary: typeof o.executive_summary === "string" ? o.executive_summary.trim() : "",
      business_consistency: { verdict, findings: strArr(bc.findings) },
      risk_prediction: risks,
      recommendations: strArr(o.recommendations),
      go_no_go: typeof o.go_no_go === "string" && GONOGO.has(o.go_no_go) ? (o.go_no_go as SimValidationData["go_no_go"]) : "conditional_go",
    },
  };
}
