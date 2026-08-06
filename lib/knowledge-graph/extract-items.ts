import { keyOfItem } from "@/lib/brain-v2/diff";
import type { BrainSectionKey } from "@/lib/brain-v2/types";
import type { EvidenceRef } from "@/lib/discovery-analysis/types";

/**
 * أقسام Brain v2 القائمة على Array (كل عنصر فيها له مفتاح عبر keyOfItem)
 * — دي اللي بتتحوّل لعُقد معرفة مستقلة. الأقسام النصية/الوصفية
 * (executive_summary/business_model) سردية مش قابلة للتقسيم لعناصر
 * مستقلة — بتُستثنى عمدًا، مش خطأ.
 */
const ARRAY_SECTIONS: readonly BrainSectionKey[] = [
  "business_goals",
  "stakeholders",
  "business_rules",
  "functional_requirements",
  "risks",
  "constraints",
  "assumptions",
  "known_facts",
  "missing_information",
  "user_roles",
  "suggested_features",
  "suggested_integrations",
  "suggested_kpis",
  "roadmap",
  "meeting_questions",
];

export interface FlatKnowledgeItem {
  key: string;
  title: string;
  description: string;
  evidence: EvidenceRef[];
  raw: unknown;
}

function toFlatItem(item: unknown, subcategory?: string): FlatKnowledgeItem | null {
  const key = keyOfItem(item);
  if (!key) return null;
  const rec = item as Record<string, unknown>;
  const evidence = Array.isArray(rec.evidence) ? (rec.evidence as EvidenceRef[]) : [];
  const title = subcategory ? `[${subcategory}] ${key}` : key;
  const description =
    typeof rec.reason === "string"
      ? rec.reason
      : typeof rec.rationale === "string"
        ? rec.rationale
        : typeof rec.why_needed === "string"
          ? rec.why_needed
          : typeof rec.why_critical === "string"
            ? rec.why_critical
            : "";
  return { key, title, description, evidence, raw: item };
}

/**
 * بيحوّل محتوى قسم Brain v2 واحد لمصفوفة عناصر معرفة مستقلة قابلة
 * للتحويل لصفوف knowledge_nodes. Pure — بلا أي استدعاء DB/AI.
 */
export function extractFlatItems(section: BrainSectionKey, content: unknown): FlatKnowledgeItem[] {
  if (ARRAY_SECTIONS.includes(section) && Array.isArray(content)) {
    return content.map((item) => toFlatItem(item)).filter((x): x is FlatKnowledgeItem => x !== null);
  }

  if (section === "non_functional_requirements" && typeof content === "object" && content !== null && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    return Object.entries(obj).flatMap(([sub, arr]) =>
      Array.isArray(arr) ? arr.map((item) => toFlatItem(item, sub)).filter((x): x is FlatKnowledgeItem => x !== null) : []
    );
  }

  if (section === "project_scope" && typeof content === "object" && content !== null && !Array.isArray(content)) {
    const obj = content as { in_scope?: unknown[]; out_of_scope?: unknown[] };
    return [
      ...(Array.isArray(obj.in_scope) ? obj.in_scope : []).map((item) => toFlatItem(item, "in_scope")),
      ...(Array.isArray(obj.out_of_scope) ? obj.out_of_scope : []).map((item) => toFlatItem(item, "out_of_scope")),
    ].filter((x): x is FlatKnowledgeItem => x !== null);
  }

  return [];
}
