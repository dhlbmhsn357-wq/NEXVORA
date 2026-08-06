/**
 * مُتحقّق مخرَج تحليل Hypercare — نمط صارم. طبقة استشارية لا تلغي الكشف
 * الحتمي (الحوادث/الصحة) بل تُثريه بجذور الأسباب.
 */

export interface HypercareRootCause {
  incident: string;
  root_cause: string;
  confidence: number;
}

export interface HypercareAnalysisData {
  executive_summary: string;
  root_cause_analysis: HypercareRootCause[];
  recommendations: string[];
  lessons: string[];
  stability_opinion: "stable" | "watch" | "unstable";
}

export type HypercareValidation = { ok: true; data: HypercareAnalysisData } | { ok: false; reason: string };

const OPINIONS = new Set(["stable", "watch", "unstable"]);

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}
function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 30) : [];
}

export function validateHypercareAnalysis(raw: string | null): HypercareValidation {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "مخرَج فارغ." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "JSON غير صالح." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "المخرَج ليس كائنًا." };
  const o = parsed as Record<string, unknown>;

  const rca: HypercareRootCause[] = Array.isArray(o.root_cause_analysis)
    ? (o.root_cause_analysis as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((r) => ({
          incident: typeof r.incident === "string" ? r.incident.trim() : "",
          root_cause: typeof r.root_cause === "string" ? r.root_cause.trim() : "",
          confidence: clamp(r.confidence),
        }))
        .filter((r) => r.incident || r.root_cause)
        .slice(0, 30)
    : [];

  return {
    ok: true,
    data: {
      executive_summary: typeof o.executive_summary === "string" ? o.executive_summary.trim() : "",
      root_cause_analysis: rca,
      recommendations: strArr(o.recommendations),
      lessons: strArr(o.lessons),
      stability_opinion: typeof o.stability_opinion === "string" && OPINIONS.has(o.stability_opinion) ? (o.stability_opinion as HypercareAnalysisData["stability_opinion"]) : "watch",
    },
  };
}
