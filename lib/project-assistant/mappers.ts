import type { InformationClassification, Confidentiality } from "@/lib/market-research/types";
import type { KnowledgeEntryDraft } from "./types";

/**
 * مُصنِّفات مساعد المشروع — نقيّة بالكامل (بلا I/O، بلا Supabase).
 *
 * كل دالة بتاخد صفّ خام من جدول مصدر وترجّع KnowledgeEntryDraft: نصّ
 * منسّق قابل للـ embedding + عنوان عرض + تصنيف/سرّية موروثين بأمان.
 *
 * قاعدة ثابتة: أي مصدر مالوش عمود confidentiality بيتحدّد 'internal'
 * صراحةً هنا — أبدًا 'public' بصمت.
 */

const DEFAULT_CONFIDENTIALITY: Confidentiality = "internal";

function joinNonEmpty(parts: Array<string | null | undefined>, sep = " — "): string {
  return parts.filter((p) => p && p.trim().length > 0).join(sep);
}

// ============================================================
// 1) Discovery — discovery_analyses
// ============================================================
export interface DiscoveryAnalysisRow {
  id: string;
  project_id: string;
  status: string;
  output: unknown;
  version: number | null;
}

export function buildKnowledgeEntryForDiscoveryAnalysis(row: DiscoveryAnalysisRow): KnowledgeEntryDraft {
  const outputText =
    row.output && typeof row.output === "object" ? JSON.stringify(row.output).slice(0, 4000) : String(row.output ?? "");
  const content = `تحليل الاكتشاف (نسخة ${row.version ?? 1}) — الحالة: ${row.status}.\n${outputText}`;
  return {
    objectType: "discovery",
    objectId: row.id,
    title: `تحليل الاكتشاف — نسخة ${row.version ?? 1}`,
    sourceTitle: `تحليل الاكتشاف — نسخة ${row.version ?? 1}`,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: row.version ?? null,
    metadata: {},
  };
}

// ============================================================
// 2) Meetings — meetings (العنوان + الحالة فقط؛ محتوى الاجتماع التفصيلي
//    مفهرس بالفعل عبر meeting_decisions/meeting_questions كمصادر مستقلة)
// ============================================================
export interface MeetingRow {
  id: string;
  project_id: string;
  title: string;
  meeting_date: string | null;
  status: string;
}

export function buildKnowledgeEntryForMeeting(row: MeetingRow): KnowledgeEntryDraft {
  const content = `اجتماع: ${row.title}${row.meeting_date ? ` بتاريخ ${row.meeting_date}` : ""}. الحالة: ${row.status}.`;
  return {
    objectType: "meeting",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: {},
  };
}

// ============================================================
// 3) Brain — project_brain_entries
// ============================================================
export interface BrainEntryRow {
  id: string;
  project_id: string;
  entry_type: string;
  content: string;
}

const BRAIN_ENTRY_TYPE_LABELS: Record<string, string> = {
  note: "ملاحظة",
  decision: "قرار",
  link: "رابط",
  risk: "مخاطرة",
  question: "سؤال",
};

export function buildKnowledgeEntryForBrainEntry(row: BrainEntryRow): KnowledgeEntryDraft {
  const label = BRAIN_ENTRY_TYPE_LABELS[row.entry_type] ?? row.entry_type;
  const content = `${label} (Brain): ${row.content}`;
  return {
    objectType: "brain",
    objectId: row.id,
    title: content.slice(0, 80),
    sourceTitle: `${label} — Brain`,
    content,
    domain: row.entry_type,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: { entryType: row.entry_type },
  };
}

// ============================================================
// 4) Personas — product_personas
// ============================================================
export interface PersonaRow {
  id: string;
  project_id: string;
  name: string;
  role: string | null;
  segment: string | null;
  jobs_to_be_done: string | null;
  goals: string | null;
  pains: string | null;
  is_primary: boolean;
}

export function buildKnowledgeEntryForPersona(row: PersonaRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `شخصية مستخدم${row.is_primary ? " (أساسية)" : ""}: ${row.name}${row.role ? ` — ${row.role}` : ""}.`,
    row.segment ? `الشريحة: ${row.segment}.` : null,
    row.jobs_to_be_done ? `المهام المطلوب إنجازها: ${row.jobs_to_be_done}.` : null,
    row.goals ? `الأهداف: ${row.goals}.` : null,
    row.pains ? `نقاط الألم: ${row.pains}.` : null,
  ], "\n");
  return {
    objectType: "persona",
    objectId: row.id,
    title: row.name,
    sourceTitle: row.name,
    content,
    domain: row.segment,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: { isPrimary: row.is_primary },
  };
}

// ============================================================
// 5) User Flows — user_flows
// ============================================================
export interface UserFlowRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  flow_type: string;
  trigger_event: string | null;
  success_outcome: string | null;
}

export function buildKnowledgeEntryForUserFlow(row: UserFlowRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `تدفق مستخدم (${row.flow_type}): ${row.name}.`,
    row.description,
    row.trigger_event ? `المحفّز: ${row.trigger_event}.` : null,
    row.success_outcome ? `نتيجة النجاح: ${row.success_outcome}.` : null,
  ], "\n");
  return {
    objectType: "user_flow",
    objectId: row.id,
    title: row.name,
    sourceTitle: row.name,
    content,
    domain: row.flow_type,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: {},
  };
}

// ============================================================
// 6) Requirements — product_requirements
// ============================================================
export interface ProductRequirementRow {
  id: string;
  project_id: string;
  code: string | null;
  title: string;
  description: string | null;
  requirement_type: string;
  priority: string;
  status: string;
  rationale: string | null;
}

export function buildKnowledgeEntryForRequirement(row: ProductRequirementRow): KnowledgeEntryDraft {
  const codePrefix = row.code ? `[${row.code}] ` : "";
  const content = joinNonEmpty([
    `متطلب ${row.requirement_type === "functional" ? "وظيفي" : "غير وظيفي"} (${row.priority}): ${codePrefix}${row.title}.`,
    row.description,
    row.rationale ? `المبرر: ${row.rationale}.` : null,
    `الحالة: ${row.status}.`,
  ], "\n");
  return {
    objectType: "requirement",
    objectId: row.id,
    title: `${codePrefix}${row.title}`,
    sourceTitle: `${codePrefix}${row.title}`,
    content,
    domain: row.requirement_type,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { priority: row.priority },
  };
}

// ============================================================
// 7) Business Rules — business_rules (0116، مستوى تعريف المنتج)
// ============================================================
export interface BusinessRuleRow {
  id: string;
  project_id: string;
  title: string;
  trigger_condition: string;
  threshold_value: string;
  on_violation: string;
  enforcement_point: string;
}

export function buildKnowledgeEntryForBusinessRule(row: BusinessRuleRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `قاعدة عمل: ${row.title}.`,
    row.trigger_condition ? `الشرط: ${row.trigger_condition}.` : null,
    row.threshold_value ? `القيمة الحدّية: ${row.threshold_value}.` : null,
    row.on_violation ? `عند التجاوز: ${row.on_violation}.` : null,
    `نقطة التطبيق: ${row.enforcement_point}.`,
  ], "\n");
  return {
    objectType: "business_rule",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: { enforcementPoint: row.enforcement_point },
  };
}

// ============================================================
// 8) User Stories — user_stories
// ============================================================
export interface UserStoryRow {
  id: string;
  project_id: string;
  code: string | null;
  title: string;
  as_a: string;
  i_want: string;
  so_that: string;
  status: string;
}

export function buildKnowledgeEntryForUserStory(row: UserStoryRow): KnowledgeEntryDraft {
  const codePrefix = row.code ? `${row.code} — ` : "";
  const content = `قصة مستخدم${row.code ? ` [${row.code}]` : ""}: بصفتي ${row.as_a}، أريد ${row.i_want}، لكي ${row.so_that}. الحالة: ${row.status}.`;
  return {
    objectType: "user_story",
    objectId: row.id,
    title: `${codePrefix}${row.title}`,
    sourceTitle: `${codePrefix}${row.title}`,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: {},
  };
}

// ============================================================
// 9) Acceptance Criteria — acceptance_criteria
// ============================================================
export interface AcceptanceCriterionRow {
  id: string;
  project_id: string;
  user_story_id: string;
  title: string;
  given_clause: string;
  when_clause: string;
  then_clause: string;
  status: string;
}

export function buildKnowledgeEntryForAcceptanceCriterion(row: AcceptanceCriterionRow): KnowledgeEntryDraft {
  const content = `معيار قبول: ${row.title}. بفرض ${row.given_clause}، عندما ${row.when_clause}، إذن ${row.then_clause}. الحالة: ${row.status}.`;
  return {
    objectType: "acceptance_criteria",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { userStoryId: row.user_story_id },
  };
}

// ============================================================
// 10) Evidence — market_research_items + problem_validation_items
// ============================================================
export interface MarketResearchItemRow {
  id: string;
  project_id: string;
  item_type: string;
  title: string;
  summary: string;
  information_class: InformationClassification;
  confidentiality: Confidentiality;
}

export function buildKnowledgeEntryForMarketResearchEvidence(row: MarketResearchItemRow): KnowledgeEntryDraft {
  const content = `بحث سوقي (${row.item_type}): ${row.title}. ${row.summary}`.trim();
  return {
    objectType: "evidence",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: row.item_type,
    classification: row.information_class ?? null,
    confidentiality: row.confidentiality ?? DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: { evidenceKind: "market_research" },
  };
}

export interface ProblemValidationItemRow {
  id: string;
  project_id: string;
  evidence_type: string;
  title: string;
  pain_point: string;
  quote: string;
  information_class: InformationClassification;
  confidentiality: Confidentiality;
}

export function buildKnowledgeEntryForProblemValidationEvidence(row: ProblemValidationItemRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `دليل تحقّق مشكلة (${row.evidence_type}): ${row.title}.`,
    `الألم: ${row.pain_point}.`,
    row.quote ? `اقتباس: "${row.quote}".` : null,
  ], "\n");
  return {
    objectType: "evidence",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: row.evidence_type,
    classification: row.information_class ?? null,
    confidentiality: row.confidentiality ?? DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: { evidenceKind: "problem_validation" },
  };
}

// ============================================================
// 11) Decisions — decision_memory / meeting_decisions / knowledge_decisions
// ============================================================
export interface DecisionMemoryRow {
  id: string;
  project_id: string;
  decision_title: string;
  question: string;
  rationale: string;
  outcome: string;
}

export function buildKnowledgeEntryForDecisionMemory(row: DecisionMemoryRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `قرار: ${row.decision_title}.`,
    row.question ? `السؤال: ${row.question}.` : null,
    row.rationale ? `المبرر: ${row.rationale}.` : null,
    `النتيجة: ${row.outcome}.`,
  ], "\n");
  return {
    objectType: "decision",
    objectId: row.id,
    title: row.decision_title,
    sourceTitle: row.decision_title,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.outcome,
    version: null,
    metadata: { decisionSource: "decision_memory" },
  };
}

export interface MeetingDecisionRow {
  id: string;
  project_id: string;
  meeting_id: string;
  text: string;
  status: string; // 'active' | 'superseded'
  superseded_by_id: string | null;
  change_reason: string | null;
}

export function buildKnowledgeEntryForMeetingDecision(row: MeetingDecisionRow): KnowledgeEntryDraft {
  const content = `قرار اجتماع: ${row.text}. الحالة: ${row.status}.${row.change_reason ? ` سبب التغيير: ${row.change_reason}.` : ""}`;
  return {
    objectType: "decision",
    objectId: row.id,
    title: row.text.slice(0, 80),
    sourceTitle: row.text.slice(0, 80),
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { decisionSource: "meeting_decision", meetingId: row.meeting_id, supersededById: row.superseded_by_id },
  };
}

export interface KnowledgeDecisionRow {
  id: string;
  project_id: string;
  decision: string;
  rationale: string | null;
  decision_maker: string | null;
  impact: string | null;
  status: string; // 'active' | 'superseded' | 'reversed'
}

export function buildKnowledgeEntryForKnowledgeDecision(row: KnowledgeDecisionRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `قرار: ${row.decision}.`,
    row.decision_maker ? `متّخذ القرار: ${row.decision_maker}.` : null,
    row.rationale ? `المبرر: ${row.rationale}.` : null,
    row.impact ? `الأثر: ${row.impact}.` : null,
    `الحالة: ${row.status}.`,
  ], "\n");
  return {
    objectType: "decision",
    objectId: row.id,
    title: row.decision.slice(0, 80),
    sourceTitle: row.decision.slice(0, 80),
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { decisionSource: "knowledge_decision" },
  };
}

// ============================================================
// 12) Risks — knowledge_risks
// ============================================================
export interface KnowledgeRiskRow {
  id: string;
  project_id: string;
  description: string;
  risk_type: string;
  likelihood: string;
  severity: string;
  mitigation: string | null;
  affected_area: string | null;
  status: string;
}

export function buildKnowledgeEntryForRisk(row: KnowledgeRiskRow): KnowledgeEntryDraft {
  const content = `مخاطرة (${row.risk_type}): ${row.description} — احتمالية ${row.likelihood}/شدّة ${row.severity}.${row.mitigation ? ` التخفيف: ${row.mitigation}.` : ""} الحالة: ${row.status}.`;
  return {
    objectType: "risk",
    objectId: row.id,
    title: row.description.slice(0, 80),
    sourceTitle: row.description.slice(0, 80),
    content,
    domain: row.affected_area ?? row.risk_type,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: {},
  };
}

// ============================================================
// 13) PRD — prd (صف واحد لكل مشروع)
// ============================================================
export interface PrdRow {
  id: string;
  project_id: string;
  overview: string | null;
  problem_statement: string | null;
  version: number;
  status: string;
}

export function buildKnowledgeEntryForPrd(row: PrdRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `PRD (نسخة ${row.version}) — الحالة: ${row.status}.`,
    row.overview ? `نظرة عامة: ${row.overview}.` : null,
    row.problem_statement ? `بيان المشكلة: ${row.problem_statement}.` : null,
  ], "\n");
  return {
    objectType: "prd_section",
    objectId: row.id,
    title: `PRD — نسخة ${row.version}`,
    sourceTitle: `PRD — نسخة ${row.version}`,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: row.version,
    metadata: {},
  };
}

// ============================================================
// 14) Evaluation Scenarios — evaluation_scenarios
// ============================================================
export interface EvaluationScenarioRow {
  id: string;
  project_id: string;
  code: string | null;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  expected_result: string | null;
}

export function buildKnowledgeEntryForEvaluationScenario(row: EvaluationScenarioRow): KnowledgeEntryDraft {
  const codePrefix = row.code ? `[${row.code}] ` : "";
  const content = joinNonEmpty([
    `سيناريو تقييم (${row.category}/${row.severity}): ${codePrefix}${row.title}.`,
    row.description,
    row.expected_result ? `النتيجة المتوقعة: ${row.expected_result}.` : null,
  ], "\n");
  return {
    objectType: "evaluation_scenario",
    objectId: row.id,
    title: `${codePrefix}${row.title}`,
    sourceTitle: `${codePrefix}${row.title}`,
    content,
    domain: row.category,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: { severity: row.severity },
  };
}

// ============================================================
// 15) Prototype Review — prototype_review
// ============================================================
export interface PrototypeReviewRow {
  id: string;
  project_id: string;
  repo_url: string | null;
  completion_percentage: number | null;
  overall_status: string;
  version: number;
}

export function buildKnowledgeEntryForPrototypeReview(row: PrototypeReviewRow): KnowledgeEntryDraft {
  const content = `مراجعة نموذج أولي (نسخة ${row.version}) — الحالة: ${row.overall_status}، نسبة الاكتمال: ${row.completion_percentage ?? "غير محدد"}%.${row.repo_url ? ` المستودع: ${row.repo_url}.` : ""}`;
  return {
    objectType: "prototype_review",
    objectId: row.id,
    title: `مراجعة النموذج الأولي — نسخة ${row.version}`,
    sourceTitle: `مراجعة النموذج الأولي — نسخة ${row.version}`,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.overall_status,
    version: row.version,
    metadata: {},
  };
}

// ============================================================
// 16) Client Approval — client_approvals
// ============================================================
export interface ClientApprovalRow {
  id: string;
  project_id: string;
  target_type: string;
  title: string;
  status: string;
  decision: string | null;
  decision_note: string | null;
}

export function buildKnowledgeEntryForClientApproval(row: ClientApprovalRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `اعتماد عميل (${row.target_type}): ${row.title}. الحالة: ${row.status}.`,
    row.decision ? `القرار: ${row.decision}.` : null,
    row.decision_note ? `ملاحظة: ${row.decision_note}.` : null,
  ], "\n");
  return {
    objectType: "client_approval",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: row.target_type,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { decision: row.decision },
  };
}

// ============================================================
// 17) Handoff Items — handoff_items
// ============================================================
export interface HandoffItemRow {
  id: string;
  project_id: string;
  item_key: string;
  status: string;
  content_text: string | null;
  notes: string | null;
}

export function buildKnowledgeEntryForHandoffItem(row: HandoffItemRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `عنصر تسليم: ${row.item_key}. الحالة: ${row.status}.`,
    row.content_text,
    row.notes ? `ملاحظات: ${row.notes}.` : null,
  ], "\n");
  return {
    objectType: "handoff_item",
    objectId: row.id,
    title: row.item_key,
    sourceTitle: row.item_key,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: {},
  };
}

// ============================================================
// 18) Commercial — proposals + contracts
// ============================================================
export interface ProposalRow {
  id: string;
  project_id: string;
  title: string;
  status: string; // includes 'superseded'
  total_amount: number | null;
  currency: string | null;
  version: number;
}

export function buildKnowledgeEntryForProposal(row: ProposalRow): KnowledgeEntryDraft {
  const content = `عرض تجاري (نسخة ${row.version}): ${row.title}. الحالة: ${row.status}.${row.total_amount ? ` الإجمالي: ${row.total_amount} ${row.currency ?? ""}.` : ""}`;
  return {
    objectType: "commercial",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: "proposal",
    classification: null,
    confidentiality: "confidential",
    status: row.status,
    version: row.version,
    metadata: {},
  };
}

export interface ContractRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  total_amount: number | null;
  currency: string | null;
}

export function buildKnowledgeEntryForContract(row: ContractRow): KnowledgeEntryDraft {
  const content = `عقد: ${row.title}. الحالة: ${row.status}.${row.total_amount ? ` الإجمالي: ${row.total_amount} ${row.currency ?? ""}.` : ""}`;
  return {
    objectType: "commercial",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: "contract",
    classification: null,
    confidentiality: "confidential",
    status: row.status,
    version: null,
    metadata: {},
  };
}

// ============================================================
// 19) Tasks — workspace_tasks
// ============================================================
export interface WorkspaceTaskRow {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
}

export function buildKnowledgeEntryForTask(row: WorkspaceTaskRow): KnowledgeEntryDraft {
  const content = joinNonEmpty([
    `مهمة (${row.priority}): ${row.title}. الحالة: ${row.status}.`,
    row.description,
  ], "\n");
  return {
    objectType: "task",
    objectId: row.id,
    title: row.title,
    sourceTitle: row.title,
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { priority: row.priority },
  };
}

// ============================================================
// 20) Open Questions — meeting_questions (discovery_questions مؤجّل — راجع الملاحظات)
// ============================================================
export interface MeetingQuestionRow {
  id: string;
  project_id: string;
  meeting_id: string;
  text: string;
  status: string; // 'open' | 'answered'
  answer: string | null;
}

export function buildKnowledgeEntryForMeetingQuestion(row: MeetingQuestionRow): KnowledgeEntryDraft {
  const content = `سؤال مفتوح من اجتماع: ${row.text}. الحالة: ${row.status}.${row.answer ? ` الإجابة: ${row.answer}.` : ""}`;
  return {
    objectType: "open_question",
    objectId: row.id,
    title: row.text.slice(0, 80),
    sourceTitle: row.text.slice(0, 80),
    content,
    domain: null,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: row.status,
    version: null,
    metadata: { meetingId: row.meeting_id },
  };
}

// ============================================================
// 21) System Messages — system_messages (0116)
// ============================================================
export interface SystemMessageRow {
  id: string;
  project_id: string;
  event_name: string;
  message_type: string;
  message_text: string;
}

export function buildKnowledgeEntryForSystemMessage(row: SystemMessageRow): KnowledgeEntryDraft {
  const content = `رسالة نظام (${row.message_type}) للحدث "${row.event_name}": ${row.message_text}`;
  return {
    objectType: "system_message",
    objectId: row.id,
    title: row.event_name,
    sourceTitle: row.event_name,
    content,
    domain: row.message_type,
    classification: null,
    confidentiality: DEFAULT_CONFIDENTIALITY,
    status: null,
    version: null,
    metadata: {},
  };
}
