import type { AuditFindingSeverity, MonitoringIncidentCategory, MonitoringPriorityLevel } from "@/lib/types/database";

const CATEGORIES: MonitoringIncidentCategory[] = ["frontend", "api", "performance", "availability", "console_error", "regression"];
const SEVERITIES: AuditFindingSeverity[] = ["critical", "high", "medium", "low", "info"];
const PRIORITY_LEVELS: MonitoringPriorityLevel[] = ["critical", "high", "medium", "low"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}
function priorityOrNull(value: unknown): MonitoringPriorityLevel | null {
  return typeof value === "string" && PRIORITY_LEVELS.includes(value as MonitoringPriorityLevel) ? (value as MonitoringPriorityLevel) : null;
}

export interface ParsedIncident {
  incident_key: string;
  category: MonitoringIncidentCategory;
  severity: AuditFindingSeverity;
  title: string;
  description: string;
  root_cause: string;
  confidence_score: number;
  patch_proposal: string;
  refactoring_proposal: string;
  performance_proposal: string;
  security_proposal: string;
  ux_proposal: string;
  similar_past_incident_index: number | null;
  similarity_reason: string;
  affected_components: string[];
  risk_level: MonitoringPriorityLevel | null;
  workaround: string;
  permanent_solution: string;
  estimated_fix_time_hours: number | null;
  priority: MonitoringPriorityLevel | null;
  affected_users_estimate: string;
}

function validateIncident(raw: unknown, index: number): { ok: true; value: ParsedIncident } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: `Incident رقم ${index + 1} ليس كائنًا.` };
  }
  const i = raw as Record<string, unknown>;

  if (!isNonEmptyString(i.incident_key)) return { ok: false, reason: `Incident رقم ${index + 1}: incident_key مفقود.` };
  if (typeof i.category !== "string" || !CATEGORIES.includes(i.category as MonitoringIncidentCategory)) {
    return { ok: false, reason: `Incident رقم ${index + 1}: category غير صالح.` };
  }
  if (typeof i.severity !== "string" || !SEVERITIES.includes(i.severity as AuditFindingSeverity)) {
    return { ok: false, reason: `Incident رقم ${index + 1}: severity غير صالح.` };
  }
  if (!isNonEmptyString(i.title)) return { ok: false, reason: `Incident رقم ${index + 1}: title مفقود.` };
  if (!isNonEmptyString(i.description)) return { ok: false, reason: `Incident رقم ${index + 1}: description مفقود.` };
  if (!isNonEmptyString(i.root_cause)) return { ok: false, reason: `Incident رقم ${index + 1}: root_cause مفقود.` };

  const confidence = Number(i.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, reason: `Incident رقم ${index + 1}: confidence_score غير صالح.` };
  }

  let similarIndex: number | null = null;
  if (i.similar_past_incident_index !== null && i.similar_past_incident_index !== undefined) {
    const n = Number(i.similar_past_incident_index);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: `Incident رقم ${index + 1}: similar_past_incident_index غير صالح.` };
    similarIndex = Math.round(n);
  }

  return {
    ok: true,
    value: {
      incident_key: i.incident_key,
      category: i.category as MonitoringIncidentCategory,
      severity: i.severity as AuditFindingSeverity,
      title: i.title,
      description: i.description,
      root_cause: i.root_cause,
      confidence_score: Math.round(confidence),
      patch_proposal: isNonEmptyString(i.patch_proposal) ? i.patch_proposal : "",
      refactoring_proposal: isNonEmptyString(i.refactoring_proposal) ? i.refactoring_proposal : "",
      performance_proposal: isNonEmptyString(i.performance_proposal) ? i.performance_proposal : "",
      security_proposal: isNonEmptyString(i.security_proposal) ? i.security_proposal : "",
      ux_proposal: isNonEmptyString(i.ux_proposal) ? i.ux_proposal : "",
      similar_past_incident_index: similarIndex,
      similarity_reason: isNonEmptyString(i.similarity_reason) ? i.similarity_reason : "",
      affected_components: stringArray(i.affected_components),
      risk_level: priorityOrNull(i.risk_level),
      workaround: isNonEmptyString(i.workaround) ? i.workaround : "",
      permanent_solution: isNonEmptyString(i.permanent_solution) ? i.permanent_solution : "",
      estimated_fix_time_hours: Number.isFinite(Number(i.estimated_fix_time_hours)) ? Math.max(0, Number(i.estimated_fix_time_hours)) : null,
      priority: priorityOrNull(i.priority),
      affected_users_estimate: isNonEmptyString(i.affected_users_estimate) ? i.affected_users_estimate : "",
    },
  };
}

export type IncidentAnalysisValidationResult = { ok: true; data: ParsedIncident[] } | { ok: false; reason: string };

export function validateIncidentAnalysis(raw: string | null): IncidentAnalysisValidationResult {
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
  if (!Array.isArray(obj.incidents)) return { ok: false, reason: "incidents لازم يكون مصفوفة." };

  const incidents: ParsedIncident[] = [];
  for (let i = 0; i < obj.incidents.length; i++) {
    const result = validateIncident(obj.incidents[i], i);
    if (!result.ok) return { ok: false, reason: result.reason };
    incidents.push(result.value);
  }

  return { ok: true, data: incidents };
}
