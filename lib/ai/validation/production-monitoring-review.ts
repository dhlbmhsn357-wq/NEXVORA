import type { MonitoringReviewVerdict, MonitoringReviewVerdictType } from "@/lib/types/database";

const VERDICT_TYPES: MonitoringReviewVerdictType[] = [
  "solved_completely", "solved_partially", "still_exists", "new_issues_introduced",
  "performance_improved", "security_improved", "regression_found",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type ReviewVerdictValidationResult = { ok: true; data: MonitoringReviewVerdict[] } | { ok: false; reason: string };

/** validIncidentIds تمنع الـ Hallucination — أي incident_id مش من القائمة الحقيقية يُسقط بهدوء. */
export function validateReviewVerdicts(raw: string | null, validIncidentIds: Set<string>): ReviewVerdictValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.verdicts)) return { ok: false, reason: "verdicts لازم يكون مصفوفة." };

  const verdicts: MonitoringReviewVerdict[] = [];
  for (const raw_v of obj.verdicts) {
    if (typeof raw_v !== "object" || raw_v === null) continue;
    const v = raw_v as Record<string, unknown>;
    if (typeof v.incident_id !== "string" || !validIncidentIds.has(v.incident_id)) continue;
    if (typeof v.verdict !== "string" || !VERDICT_TYPES.includes(v.verdict as MonitoringReviewVerdictType)) continue;
    verdicts.push({
      incident_id: v.incident_id,
      verdict: v.verdict as MonitoringReviewVerdictType,
      evidence: isNonEmptyString(v.evidence) ? v.evidence : "",
      explanation: isNonEmptyString(v.explanation) ? v.explanation : "",
    });
  }

  return { ok: true, data: verdicts };
}
