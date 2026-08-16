import type { InformationClassification, Confidentiality } from "@/lib/market-research/types";

/**
 * أنواع مساعد المشروع (Phase A) — الأشكال المشتركة بين المُصنِّفات
 * (mappers) وطبقة المزامنة (sync).
 */

/** قيم object_type الجديدة المضافة في 0117 (بالإضافة للقيم الأصلية في 0078). */
export type ProjectAssistantObjectType =
  | "discovery"
  | "meeting"
  | "brain"
  | "persona"
  | "user_flow"
  | "requirement" // reused من 0078
  | "business_rule" // reused من 0078
  | "user_story"
  | "acceptance_criteria"
  | "evidence"
  | "decision" // reused من 0078
  | "risk" // reused من 0078
  | "prd_section"
  | "evaluation_scenario"
  | "prototype_review"
  | "client_approval"
  | "handoff_item"
  | "commercial"
  | "task"
  | "open_question"
  | "system_message";

/**
 * "مصدر" أدق من object_type — لأن أكتر من جدول مصدر بيشارك نفس
 * object_type (مثلًا decision_memory + meeting_decisions + knowledge_decisions
 * كلهم object_type='decision'). syncKnowledgeEntry بيستقبل SourceDomain
 * عشان يعرف يجيب الصف الصحيح من الجدول الصحيح.
 */
export type SourceDomain =
  | "discovery_analysis"
  | "meeting"
  | "brain_entry"
  | "persona"
  | "user_flow"
  | "product_requirement"
  | "business_rule"
  | "user_story"
  | "acceptance_criteria"
  | "market_research_evidence"
  | "problem_validation_evidence"
  | "decision_memory"
  | "meeting_decision"
  | "knowledge_decision"
  | "knowledge_risk"
  | "prd"
  | "evaluation_scenario"
  | "prototype_review"
  | "client_approval"
  | "handoff_item"
  | "proposal"
  | "contract"
  | "workspace_task"
  | "meeting_question"
  | "system_message";

/** خريطة SourceDomain → object_type في knowledge_memory. */
export const DOMAIN_OBJECT_TYPE: Record<SourceDomain, ProjectAssistantObjectType> = {
  discovery_analysis: "discovery",
  meeting: "meeting",
  brain_entry: "brain",
  persona: "persona",
  user_flow: "user_flow",
  product_requirement: "requirement",
  business_rule: "business_rule",
  user_story: "user_story",
  acceptance_criteria: "acceptance_criteria",
  market_research_evidence: "evidence",
  problem_validation_evidence: "evidence",
  decision_memory: "decision",
  meeting_decision: "decision",
  knowledge_decision: "decision",
  knowledge_risk: "risk",
  prd: "prd_section",
  evaluation_scenario: "evaluation_scenario",
  prototype_review: "prototype_review",
  client_approval: "client_approval",
  handoff_item: "handoff_item",
  proposal: "commercial",
  contract: "commercial",
  workspace_task: "task",
  meeting_question: "open_question",
  system_message: "system_message",
};

/** ناتج مُصنِّف نقي — بلا أي I/O — جاهز للـ embedding والـ upsert. */
export interface KnowledgeEntryDraft {
  objectType: ProjectAssistantObjectType;
  objectId: string;
  title: string;
  sourceTitle: string;
  content: string;
  domain: string | null;
  classification: InformationClassification | null;
  confidentiality: Confidentiality;
  status: string | null;
  version: number | null;
  metadata: Record<string, unknown>;
}

export interface MemorySourceRef {
  objectType: string;
  objectId: string;
  sourceTitle: string;
  similarity?: number;
}
