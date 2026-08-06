import type { AuditFindingSeverity, ValidationJourneyStep } from "@/lib/types/database";

const STEP_TYPES: ValidationJourneyStep["type"][] = [
  "navigate",
  "click",
  "fill",
  "expect_text",
  "wait",
  "go_back",
  "go_forward",
  "reload",
  "set_offline",
  "set_online",
  "throttle_network",
  "double_click",
  "rapid_click",
];

const INPUT_KINDS: NonNullable<ValidationJourneyStep["inputKind"]>[] = [
  "valid",
  "empty",
  "huge",
  "special_chars",
  "emoji",
  "unicode",
  "sql_injection_like",
];

const SEVERITIES: AuditFindingSeverity[] = ["critical", "high", "medium", "low", "info"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ParsedJourney {
  journey_key: string;
  name: string;
  goal: string;
  steps: ValidationJourneyStep[];
}

function validateStep(raw: unknown, journeyIndex: number, stepIndex: number): { ok: true; value: ValidationJourneyStep } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: `Journey ${journeyIndex + 1}, Step ${stepIndex + 1} ليست كائنًا.` };
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.type !== "string" || !STEP_TYPES.includes(s.type as ValidationJourneyStep["type"])) {
    return { ok: false, reason: `Journey ${journeyIndex + 1}, Step ${stepIndex + 1}: type غير صالح.` };
  }
  if (!isNonEmptyString(s.description)) {
    return { ok: false, reason: `Journey ${journeyIndex + 1}, Step ${stepIndex + 1}: description مفقود.` };
  }
  if (s.inputKind !== undefined && !INPUT_KINDS.includes(s.inputKind as never)) {
    return { ok: false, reason: `Journey ${journeyIndex + 1}, Step ${stepIndex + 1}: inputKind غير صالح.` };
  }

  return {
    ok: true,
    value: {
      type: s.type as ValidationJourneyStep["type"],
      target: isNonEmptyString(s.target) ? s.target : undefined,
      value: isNonEmptyString(s.value) ? s.value : undefined,
      inputKind: s.inputKind as ValidationJourneyStep["inputKind"],
      description: s.description as string,
    },
  };
}

export type JourneyGenerationValidationResult = { ok: true; data: ParsedJourney[] } | { ok: false; reason: string };

export function validateJourneyGeneration(raw: string | null): JourneyGenerationValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

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
  if (!Array.isArray(obj.journeys) || obj.journeys.length === 0) {
    return { ok: false, reason: "journeys لازم يكون مصفوفة غير فاضية." };
  }

  const journeys: ParsedJourney[] = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < obj.journeys.length; i++) {
    const j = obj.journeys[i];
    if (typeof j !== "object" || j === null) return { ok: false, reason: `Journey ${i + 1} ليست كائنًا.` };
    const jo = j as Record<string, unknown>;
    if (!isNonEmptyString(jo.journey_key)) return { ok: false, reason: `Journey ${i + 1}: journey_key مفقود.` };
    if (seenKeys.has(jo.journey_key)) return { ok: false, reason: `Journey ${i + 1}: journey_key مكرر (${jo.journey_key}).` };
    seenKeys.add(jo.journey_key);
    if (!isNonEmptyString(jo.name)) return { ok: false, reason: `Journey ${i + 1}: name مفقود.` };
    if (!Array.isArray(jo.steps) || jo.steps.length === 0) return { ok: false, reason: `Journey ${i + 1}: steps لازم يكون مصفوفة غير فاضية.` };

    const steps: ValidationJourneyStep[] = [];
    for (let k = 0; k < jo.steps.length; k++) {
      const result = validateStep(jo.steps[k], i, k);
      if (!result.ok) return { ok: false, reason: result.reason };
      steps.push(result.value);
    }

    journeys.push({
      journey_key: jo.journey_key,
      name: jo.name,
      goal: isNonEmptyString(jo.goal) ? jo.goal : "",
      steps,
    });
  }

  return { ok: true, data: journeys };
}

export interface ParsedEnrichedFinding {
  finding_key: string;
  title: string;
  severity: AuditFindingSeverity;
  description: string;
  impact: string;
  root_cause: string;
  recommended_fix: string;
  occurrence_count: number;
  confidence_score: number;
}

export type CategoryEnrichmentValidationResult =
  | { ok: true; data: { summary: string; findings: ParsedEnrichedFinding[] } }
  | { ok: false; reason: string };

export function validateCategoryEnrichment(raw: string | null): CategoryEnrichmentValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

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

  const findings: ParsedEnrichedFinding[] = [];
  for (let i = 0; i < obj.findings.length; i++) {
    const f = obj.findings[i];
    if (typeof f !== "object" || f === null) return { ok: false, reason: `Finding ${i + 1} ليس كائنًا.` };
    const fo = f as Record<string, unknown>;
    if (!isNonEmptyString(fo.finding_key)) return { ok: false, reason: `Finding ${i + 1}: finding_key مفقود.` };
    if (!isNonEmptyString(fo.title)) return { ok: false, reason: `Finding ${i + 1}: title مفقود.` };
    if (typeof fo.severity !== "string" || !SEVERITIES.includes(fo.severity as AuditFindingSeverity)) {
      return { ok: false, reason: `Finding ${i + 1}: severity غير صالح.` };
    }
    if (!isNonEmptyString(fo.description)) return { ok: false, reason: `Finding ${i + 1}: description مفقود.` };
    if (!isNonEmptyString(fo.root_cause)) return { ok: false, reason: `Finding ${i + 1}: root_cause مفقود.` };
    if (!isNonEmptyString(fo.recommended_fix)) return { ok: false, reason: `Finding ${i + 1}: recommended_fix مفقود.` };

    const occurrenceCount = Number(fo.occurrence_count);
    const confidence = Number(fo.confidence_score);
    if (!Number.isFinite(occurrenceCount) || occurrenceCount < 1) return { ok: false, reason: `Finding ${i + 1}: occurrence_count غير صالح.` };
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) return { ok: false, reason: `Finding ${i + 1}: confidence_score غير صالح.` };

    findings.push({
      finding_key: fo.finding_key,
      title: fo.title,
      severity: fo.severity as AuditFindingSeverity,
      description: fo.description,
      impact: isNonEmptyString(fo.impact) ? fo.impact : "",
      root_cause: fo.root_cause,
      recommended_fix: fo.recommended_fix,
      occurrence_count: Math.round(occurrenceCount),
      confidence_score: Math.round(confidence),
    });
  }

  return { ok: true, data: { summary: obj.summary, findings } };
}
