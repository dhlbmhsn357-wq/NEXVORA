const RELATION_TYPES = ["depends_on", "related_to", "blocks", "part_of", "conflicts_with"] as const;
type RelationType = (typeof RELATION_TYPES)[number];

export interface KnowledgeGraphAnalysisItem {
  description: string;
  node_ids: string[];
}

export interface ProposedRelation {
  from_id: string;
  to_id: string;
  relation_type: RelationType;
}

export interface KnowledgeGraphAnalysisResult {
  terminologyIssues: KnowledgeGraphAnalysisItem[];
  semanticDuplicates: KnowledgeGraphAnalysisItem[];
  proposedRelations: ProposedRelation[];
}

export type KnowledgeGraphAnalysisValidationResult =
  | { ok: true; data: KnowledgeGraphAnalysisResult }
  | { ok: false; reason: string };

function toItemArray(value: unknown): KnowledgeGraphAnalysisItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      description: typeof v.description === "string" ? v.description.trim() : "",
      node_ids: Array.isArray(v.node_ids) ? v.node_ids.filter((id): id is string => typeof id === "string") : [],
    }))
    .filter((v) => v.description.length > 0 && v.node_ids.length > 0);
}

function toRelationArray(value: unknown, validNodeIds: Set<string>): ProposedRelation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      from_id: typeof v.from_id === "string" ? v.from_id : "",
      to_id: typeof v.to_id === "string" ? v.to_id : "",
      relation_type: RELATION_TYPES.includes(v.relation_type as RelationType) ? (v.relation_type as RelationType) : "related_to",
    }))
    .filter((v) => v.from_id && v.to_id && v.from_id !== v.to_id && validNodeIds.has(v.from_id) && validNodeIds.has(v.to_id));
}

/** validNodeIds مطلوبة عشان نرفض أي علاقة مقترحة على ID مش موجود فعليًا — منع Hallucination. */
export function validateKnowledgeGraphAnalysis(raw: string | null, validNodeIds: Set<string>): KnowledgeGraphAnalysisValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

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
      terminologyIssues: toItemArray(obj.terminology_issues),
      semanticDuplicates: toItemArray(obj.semantic_duplicates),
      proposedRelations: toRelationArray(obj.proposed_relations, validNodeIds),
    },
  };
}
