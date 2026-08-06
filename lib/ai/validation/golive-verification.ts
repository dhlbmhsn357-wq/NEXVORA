/**
 * مُتحقّق مخرَج تحقّق ما بعد الترحيل (Go-Live) — نمط صارم. طبقة استشارية
 * لا تلغي الحكم الحتمي (Final Score + Certificate gate) بل تُثريه.
 */

export interface GoLiveHiddenProblem {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export interface GoLiveVerificationData {
  executive_summary: string;
  business_consistency: { verdict: "consistent" | "minor_gaps" | "inconsistent"; findings: string[] };
  hidden_problems: GoLiveHiddenProblem[];
  recommendations: string[];
  go_live_opinion: "go" | "conditional" | "hold";
}

export type GoLiveValidation = { ok: true; data: GoLiveVerificationData } | { ok: false; reason: string };

const SEV = new Set(["low", "medium", "high", "critical"]);
const VERDICTS = new Set(["consistent", "minor_gaps", "inconsistent"]);
const OPINIONS = new Set(["go", "conditional", "hold"]);

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 30) : [];
}

export function validateGoLiveVerification(raw: string | null): GoLiveValidation {
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

  const problems: GoLiveHiddenProblem[] = Array.isArray(o.hidden_problems)
    ? (o.hidden_problems as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((p) => ({
          title: typeof p.title === "string" ? p.title.trim() : "",
          severity: typeof p.severity === "string" && SEV.has(p.severity) ? (p.severity as GoLiveHiddenProblem["severity"]) : "medium",
          reason: typeof p.reason === "string" ? p.reason.trim() : "",
        }))
        .filter((p) => p.title)
        .slice(0, 30)
    : [];

  return {
    ok: true,
    data: {
      executive_summary: typeof o.executive_summary === "string" ? o.executive_summary.trim() : "",
      business_consistency: {
        verdict: typeof bc.verdict === "string" && VERDICTS.has(bc.verdict) ? (bc.verdict as GoLiveVerificationData["business_consistency"]["verdict"]) : "minor_gaps",
        findings: strArr(bc.findings),
      },
      hidden_problems: problems,
      recommendations: strArr(o.recommendations),
      go_live_opinion: typeof o.go_live_opinion === "string" && OPINIONS.has(o.go_live_opinion) ? (o.go_live_opinion as GoLiveVerificationData["go_live_opinion"]) : "conditional",
    },
  };
}
