import type { BrainReviewIssue, BrainReviewIssueSeverity, BrainReviewIssueType } from "@/lib/types/database";

const ISSUE_TYPES: BrainReviewIssueType[] = [
  "missing_requirement", "conflicting_rule", "undefined_entity", "unresolved_decision",
  "unanswered_question", "security_weakness", "scalability_risk", "architecture_inconsistency",
  "inconsistent_terminology", "operational_readiness_gap",
];
const SEVERITIES: BrainReviewIssueSeverity[] = ["critical", "high", "medium", "low"];
const RELATION_TYPES = ["depends_on", "conflicts_with", "related_to"] as const;
type RelationType = (typeof RELATION_TYPES)[number];

export interface ProposedDependencyPair {
  from_key: string;
  to_key: string;
  relation_type: RelationType;
}

export interface BrainReviewValidationResult {
  business_readiness: number;
  architecture_readiness: number;
  technical_readiness: number;
  ai_confidence: number;
  issues: BrainReviewIssue[];
  dependency_pairs: ProposedDependencyPair[];
}

export type BrainReviewValidationParseResult = { ok: true; data: BrainReviewValidationResult } | { ok: false; reason: string };

function clamp0to100(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

function toIssues(value: unknown, validKeys: Set<string>): BrainReviewIssue[] {
  if (!Array.isArray(value)) return [];
  const out: BrainReviewIssue[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const v = raw as Record<string, unknown>;
    if (typeof v.type !== "string" || !ISSUE_TYPES.includes(v.type as BrainReviewIssueType)) continue;
    if (typeof v.description !== "string" || !v.description.trim()) continue;
    const severity = typeof v.severity === "string" && SEVERITIES.includes(v.severity as BrainReviewIssueSeverity) ? (v.severity as BrainReviewIssueSeverity) : "medium";
    const relatedKeys = Array.isArray(v.related_keys)
      ? v.related_keys.filter((k): k is string => typeof k === "string" && validKeys.has(k))
      : [];
    out.push({
      type: v.type as BrainReviewIssueType,
      severity,
      category: typeof v.category === "string" ? v.category.trim() : "عام",
      description: v.description.trim(),
      related_object_keys: relatedKeys,
    });
  }
  return out;
}

/** validKeys تمنع الـ Hallucination — أي مفتاح مش من القائمة الحقيقية بيتجاهل بهدوء (issue أو dependency pair). */
function toDependencyPairs(value: unknown, validKeys: Set<string>): ProposedDependencyPair[] {
  if (!Array.isArray(value)) return [];
  const out: ProposedDependencyPair[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const v = raw as Record<string, unknown>;
    const from_key = typeof v.from_key === "string" ? v.from_key : "";
    const to_key = typeof v.to_key === "string" ? v.to_key : "";
    const relation_type = RELATION_TYPES.includes(v.relation_type as RelationType) ? (v.relation_type as RelationType) : "related_to";
    if (!from_key || !to_key || from_key === to_key) continue;
    if (!validKeys.has(from_key) || !validKeys.has(to_key)) continue;
    out.push({ from_key, to_key, relation_type });
  }
  return out;
}

export function validateBrainReviewValidation(raw: string | null, validKeys: Set<string>): BrainReviewValidationParseResult {
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

  return {
    ok: true,
    data: {
      business_readiness: clamp0to100(obj.business_readiness, 50),
      architecture_readiness: clamp0to100(obj.architecture_readiness, 50),
      technical_readiness: clamp0to100(obj.technical_readiness, 50),
      ai_confidence: clamp0to100(obj.ai_confidence, 50),
      issues: toIssues(obj.issues, validKeys),
      dependency_pairs: toDependencyPairs(obj.dependency_pairs, validKeys),
    },
  };
}
