import type { MeetingPrepContext } from "../context";
import type { SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepSectionKey, MeetingPrepSections } from "../types";
import { generateExecutiveBrief } from "./executive-brief";
import { generateCustomerProfile } from "./customer-profile";
import { generateBusinessUnderstanding } from "./business-understanding";
import { generateMeetingObjectives } from "./meeting-objectives";
import { generateSuggestedAgenda } from "./suggested-agenda";
import { generateConversationSimulation } from "./conversation-simulation";
import { generateSmartQuestions } from "./smart-questions";
import { generateMissingInformationChecklist } from "./missing-information-checklist";
import { generateDecisionChecklist } from "./decision-checklist";
import { generateRiskDiscussion } from "./risk-discussion";
import { generateScopeProtection } from "./scope-protection";
import { generateSuccessCriteria } from "./success-criteria";
import { generateFollowUpChecklist } from "./follow-up-checklist";

type GeneratorFn = (
  ctx: MeetingPrepContext,
  actorId?: string | null
) => Promise<SectionGenerationResult<unknown>>;

/**
 * سجل المولّدات المستقلة — كل قسم من الـ13 له دالة توليد مستقلة تمامًا،
 * قابلة للاستدعاء منفردة (لإعادة توليد قسم واحد فقط) أو كلها معًا (أول
 * توليد كامل بعد اكتمال Discovery Analysis).
 */
export const SECTION_GENERATORS: Record<MeetingPrepSectionKey, GeneratorFn> = {
  executive_brief: generateExecutiveBrief as GeneratorFn,
  customer_profile: generateCustomerProfile as GeneratorFn,
  business_understanding: generateBusinessUnderstanding as GeneratorFn,
  meeting_objectives: generateMeetingObjectives as GeneratorFn,
  suggested_agenda: generateSuggestedAgenda as GeneratorFn,
  conversation_simulation: generateConversationSimulation as GeneratorFn,
  smart_questions: generateSmartQuestions as GeneratorFn,
  missing_information_checklist: generateMissingInformationChecklist as GeneratorFn,
  decision_checklist: generateDecisionChecklist as GeneratorFn,
  risk_discussion: generateRiskDiscussion as GeneratorFn,
  scope_protection: generateScopeProtection as GeneratorFn,
  success_criteria: generateSuccessCriteria as GeneratorFn,
  follow_up_checklist: generateFollowUpChecklist as GeneratorFn,
};

export type { MeetingPrepSections };
