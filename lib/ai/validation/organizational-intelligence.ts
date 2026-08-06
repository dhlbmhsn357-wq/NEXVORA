import type { DecisionMemoryOutcome, KnowledgeCategory, KnowledgeSourceType, RecommendationCategory } from "@/lib/types/database";

const CATEGORIES: KnowledgeCategory[] = [
  "business_pattern", "architecture_decision", "ux_decision", "ui_pattern",
  "reusable_component", "common_requirement", "common_risk", "common_integration",
  "common_bug", "common_mistake", "successful_solution", "failed_solution",
  "performance_lesson", "security_lesson", "deployment_lesson", "support_lesson",
  "customer_feedback_pattern", "meeting_decision_pattern", "technical_decision", "best_practice",
];
const SOURCE_TYPES: KnowledgeSourceType[] = [
  "brain", "prd", "prototype_review", "developer_handoff", "engineering_qa", "support", "production_monitoring", "meeting",
];
const OUTCOMES: DecisionMemoryOutcome[] = ["succeeded", "failed", "unknown"];
const RECOMMENDATION_CATEGORIES: RecommendationCategory[] = [
  "features", "architecture", "security", "performance", "integrations",
  "user_roles", "business_rules", "roadmap", "kpis", "user_stories",
  "meeting_questions", "discovery_improvements", "risk_mitigation",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface KnowledgeCandidate {
  category: KnowledgeCategory;
  title: string;
  content: string;
  confidence_score: number;
  evidence: Array<{ source_type: KnowledgeSourceType; detail: string }>;
}

export interface DecisionCandidate {
  decision_title: string;
  question: string;
  rationale: string;
  outcome: DecisionMemoryOutcome;
}

function validateKnowledgeItem(raw: unknown, index: number): { ok: true; value: KnowledgeCandidate } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: `عنصر معرفة رقم ${index + 1} ليس كائنًا.` };
  const k = raw as Record<string, unknown>;

  if (typeof k.category !== "string" || !CATEGORIES.includes(k.category as KnowledgeCategory)) {
    return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: category غير صالح.` };
  }
  if (!isNonEmptyString(k.title)) return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: title مفقود.` };
  if (!isNonEmptyString(k.content)) return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: content مفقود.` };

  const confidence = Number(k.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: confidence_score غير صالح.` };
  }

  if (!Array.isArray(k.evidence) || k.evidence.length === 0) {
    return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: لازم evidence حقيقي واحد على الأقل.` };
  }
  const evidence: Array<{ source_type: KnowledgeSourceType; detail: string }> = [];
  for (const e of k.evidence) {
    if (typeof e !== "object" || e === null) return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: evidence غير صالح.` };
    const ev = e as Record<string, unknown>;
    if (typeof ev.source_type !== "string" || !SOURCE_TYPES.includes(ev.source_type as KnowledgeSourceType)) {
      return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: evidence.source_type غير صالح.` };
    }
    if (!isNonEmptyString(ev.detail)) return { ok: false, reason: `عنصر معرفة رقم ${index + 1}: evidence.detail مفقود.` };
    evidence.push({ source_type: ev.source_type as KnowledgeSourceType, detail: ev.detail });
  }

  return {
    ok: true,
    value: { category: k.category as KnowledgeCategory, title: k.title, content: k.content, confidence_score: Math.round(confidence), evidence },
  };
}

function validateDecisionItem(raw: unknown, index: number): { ok: true; value: DecisionCandidate } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: `قرار رقم ${index + 1} ليس كائنًا.` };
  const d = raw as Record<string, unknown>;

  if (!isNonEmptyString(d.decision_title)) return { ok: false, reason: `قرار رقم ${index + 1}: decision_title مفقود.` };
  if (typeof d.outcome !== "string" || !OUTCOMES.includes(d.outcome as DecisionMemoryOutcome)) {
    return { ok: false, reason: `قرار رقم ${index + 1}: outcome غير صالح.` };
  }

  return {
    ok: true,
    value: {
      decision_title: d.decision_title,
      question: isNonEmptyString(d.question) ? d.question : "",
      rationale: isNonEmptyString(d.rationale) ? d.rationale : "",
      outcome: d.outcome as DecisionMemoryOutcome,
    },
  };
}

export type KnowledgeExtractionValidationResult =
  | { ok: true; data: { knowledge: KnowledgeCandidate[]; decisions: DecisionCandidate[] } }
  | { ok: false; reason: string };

export function validateKnowledgeExtraction(raw: string | null): KnowledgeExtractionValidationResult {
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
  if (!Array.isArray(obj.knowledge)) return { ok: false, reason: "knowledge لازم يكون مصفوفة." };
  if (obj.decisions !== undefined && !Array.isArray(obj.decisions)) return { ok: false, reason: "decisions لازم يكون مصفوفة." };

  const knowledge: KnowledgeCandidate[] = [];
  for (let i = 0; i < obj.knowledge.length; i++) {
    const result = validateKnowledgeItem(obj.knowledge[i], i);
    if (!result.ok) return { ok: false, reason: result.reason };
    knowledge.push(result.value);
  }

  const decisions: DecisionCandidate[] = [];
  const rawDecisions = Array.isArray(obj.decisions) ? obj.decisions : [];
  for (let i = 0; i < rawDecisions.length; i++) {
    const result = validateDecisionItem(rawDecisions[i], i);
    if (!result.ok) return { ok: false, reason: result.reason };
    decisions.push(result.value);
  }

  return { ok: true, data: { knowledge, decisions } };
}

export interface RecommendationCandidate {
  category: RecommendationCategory;
  recommendation: string;
  rationale: string;
  confidence_score: number;
  supporting_project_indexes: number[];
}

function validateRecommendationItem(
  raw: unknown,
  index: number,
  maxProjectIndex: number
): { ok: true; value: RecommendationCandidate } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: `توصية رقم ${index + 1} ليست كائنًا.` };
  const r = raw as Record<string, unknown>;

  if (typeof r.category !== "string" || !RECOMMENDATION_CATEGORIES.includes(r.category as RecommendationCategory)) {
    return { ok: false, reason: `توصية رقم ${index + 1}: category غير صالح.` };
  }
  if (!isNonEmptyString(r.recommendation)) return { ok: false, reason: `توصية رقم ${index + 1}: recommendation مفقود.` };

  const confidence = Number(r.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, reason: `توصية رقم ${index + 1}: confidence_score غير صالح.` };
  }

  if (!Array.isArray(r.supporting_project_indexes) || r.supporting_project_indexes.length === 0) {
    return { ok: false, reason: `توصية رقم ${index + 1}: لازم مشروع داعم واحد على الأقل (supporting_project_indexes).` };
  }
  const indexes: number[] = [];
  for (const raw_i of r.supporting_project_indexes) {
    const n = Number(raw_i);
    if (!Number.isFinite(n) || n < 0 || n > maxProjectIndex) {
      return { ok: false, reason: `توصية رقم ${index + 1}: supporting_project_indexes فيه فهرس غير صالح.` };
    }
    indexes.push(Math.round(n));
  }

  return {
    ok: true,
    value: {
      category: r.category as RecommendationCategory,
      recommendation: r.recommendation,
      rationale: isNonEmptyString(r.rationale) ? r.rationale : "",
      confidence_score: Math.round(confidence),
      supporting_project_indexes: indexes,
    },
  };
}

export type RecommendationsValidationResult = { ok: true; data: RecommendationCandidate[] } | { ok: false; reason: string };

export function validateRecommendations(raw: string | null, similarProjectsCount: number): RecommendationsValidationResult {
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
  if (!Array.isArray(obj.recommendations)) return { ok: false, reason: "recommendations لازم يكون مصفوفة." };

  const recommendations: RecommendationCandidate[] = [];
  for (let i = 0; i < obj.recommendations.length; i++) {
    const result = validateRecommendationItem(obj.recommendations[i], i, similarProjectsCount - 1);
    if (!result.ok) return { ok: false, reason: result.reason };
    recommendations.push(result.value);
  }

  return { ok: true, data: recommendations };
}

export interface PromptSuggestionCandidate {
  suggestion: string;
  rationale: string;
  confidence_score: number;
}

export type PromptSuggestionValidationResult = { ok: true; data: PromptSuggestionCandidate } | { ok: false; reason: string };

export function validatePromptSuggestion(raw: string | null): PromptSuggestionValidationResult {
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

  if (!isNonEmptyString(obj.suggestion)) return { ok: false, reason: "suggestion مفقود." };
  const confidence = Number(obj.confidence_score);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    return { ok: false, reason: "confidence_score غير صالح." };
  }

  return {
    ok: true,
    data: {
      suggestion: obj.suggestion,
      rationale: isNonEmptyString(obj.rationale) ? obj.rationale : "",
      confidence_score: Math.round(confidence),
    },
  };
}

export interface ProductAdvisorResult {
  strengths: string[];
  weaknesses: string[];
  missing_opportunities: string[];
  risks: string[];
  scalability_notes: string[];
  maintainability_notes: string[];
  business_impact: string;
  technical_impact: string;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

export type ProductAdvisorValidationResult = { ok: true; data: ProductAdvisorResult } | { ok: false; reason: string };

export function validateProductAdvisor(raw: string | null): ProductAdvisorValidationResult {
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

  return {
    ok: true,
    data: {
      strengths: stringArray(obj.strengths),
      weaknesses: stringArray(obj.weaknesses),
      missing_opportunities: stringArray(obj.missing_opportunities),
      risks: stringArray(obj.risks),
      scalability_notes: stringArray(obj.scalability_notes),
      maintainability_notes: stringArray(obj.maintainability_notes),
      business_impact: isNonEmptyString(obj.business_impact) ? obj.business_impact : "",
      technical_impact: isNonEmptyString(obj.technical_impact) ? obj.technical_impact : "",
    },
  };
}
