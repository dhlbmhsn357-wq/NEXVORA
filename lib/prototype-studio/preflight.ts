/**
 * NEXVORA Prototype Studio — Preflight Gate
 * =========================================
 * Aggregate readiness signal computed just before "Build Prototype".
 *
 * Server-only. Data access via authenticated Supabase client (RLS enforced).
 * Returns a canBuild verdict plus itemised blockers and a summary of the
 * current state of Product Definition, User Stories, AC, and evidence.
 */
import "server-only";
import { listPersonas, listFlows, listRequirements } from "@/lib/product-definition/service";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { listItems as listDecisionItems } from "@/lib/product-decisions/service";
import { listMarketResearchItems, listProblemValidationItems } from "@/lib/market-research/service";

export type PreflightSeverity = "block" | "warn";

export interface PreflightBlocker {
  key: string;
  severity: PreflightSeverity;
  message: string;
  actionUrl?: string;
}

export interface PreflightSummary {
  personasCount: number;
  coreFlowsCount: number;
  requirementsApproved: number;
  requirementsDraft: number;
  storiesApproved: number;
  storiesTotal: number;
  acApproved: number;
  acTotal: number;
  storiesWithoutAc: number;
  criticalOpenQuestions: number;
  criticalRisks: number;
  evidenceOrigins: { real: number; simulated: number; unverified: number };
}

export interface PreflightResult {
  canBuild: boolean;
  blockers: PreflightBlocker[];
  summary: PreflightSummary;
}

export async function runPreflight(projectId: string): Promise<PreflightResult> {
  const [personas, flows, requirements, stories, acs, decisions, market, validation] = await Promise.all([
    listPersonas(projectId),
    listFlows(projectId),
    listRequirements(projectId),
    listStories(projectId),
    listAcceptanceCriteria(projectId),
    listDecisionItems(projectId, {}),
    listMarketResearchItems(projectId),
    listProblemValidationItems(projectId),
  ]);

  const requirementsApproved = requirements.filter((r) => r.status === "approved").length;
  const requirementsDraft = requirements.filter((r) => r.status === "draft").length;
  const storiesApproved = stories.filter((s) => s.status === "approved" || s.status === "in_dev" || s.status === "done").length;
  const acApproved = acs.filter((a) => a.status === "approved" || a.status === "verified").length;
  const storyIds = new Set(stories.map((s) => s.id));
  const acStoryIds = new Set(acs.map((a) => a.userStoryId));
  const storiesWithoutAc = [...storyIds].filter((id) => !acStoryIds.has(id)).length;

  const criticalOpenQuestions = decisions.filter(
    (d) => d.itemType === "open_question" && d.priority === "critical" && d.status !== "resolved" && d.status !== "rejected"
  ).length;
  const criticalRisks = decisions.filter(
    (d) => d.itemType === "risk" && d.priority === "critical" && d.status !== "resolved" && d.status !== "rejected"
  ).length;

  const evidenceOrigins = { real: 0, simulated: 0, unverified: 0 };
  const bucketOrigin = (o: string | undefined) => {
    if (o === "verified_real") evidenceOrigins.real++;
    else if (o === "simulated") evidenceOrigins.simulated++;
    else evidenceOrigins.unverified++;
  };
  for (const m of market as Array<{ origin?: string }>) bucketOrigin(m.origin);
  for (const v of validation as Array<{ origin?: string }>) bucketOrigin(v.origin);

  const summary: PreflightSummary = {
    personasCount: personas.length,
    coreFlowsCount: flows.length,
    requirementsApproved,
    requirementsDraft,
    storiesApproved,
    storiesTotal: stories.length,
    acApproved,
    acTotal: acs.length,
    storiesWithoutAc,
    criticalOpenQuestions,
    criticalRisks,
    evidenceOrigins,
  };

  const blockers: PreflightBlocker[] = [];
  if (personas.length === 0) {
    blockers.push({ key: "no_personas", severity: "block", message: "لا توجد personas — عرّف على الأقل persona واحد." });
  }
  if (flows.length === 0) {
    blockers.push({ key: "no_flows", severity: "block", message: "لا توجد user flows — عرّف على الأقل flow واحد." });
  }
  if (requirementsApproved === 0) {
    blockers.push({ key: "no_approved_requirements", severity: "block", message: "لا يوجد أي متطلّب معتمد." });
  }
  if (storiesApproved === 0) {
    blockers.push({ key: "no_approved_stories", severity: "block", message: "لا توجد user stories معتمدة." });
  }
  if (acApproved === 0) {
    blockers.push({ key: "no_approved_ac", severity: "block", message: "لا توجد Acceptance Criteria معتمدة." });
  }
  if (storiesWithoutAc > 0) {
    blockers.push({
      key: "stories_missing_ac",
      severity: "warn",
      message: `${storiesWithoutAc} قصّة/قصص بدون Acceptance Criteria.`,
    });
  }
  if (criticalOpenQuestions > 0) {
    blockers.push({
      key: "critical_open_questions",
      severity: "warn",
      message: `${criticalOpenQuestions} سؤال حرج مفتوح.`,
    });
  }
  if (criticalRisks > 0) {
    blockers.push({
      key: "critical_risks",
      severity: "warn",
      message: `${criticalRisks} خطر حرج غير محلول.`,
    });
  }
  if (evidenceOrigins.real === 0 && evidenceOrigins.simulated > 0) {
    blockers.push({
      key: "only_simulated_evidence",
      severity: "warn",
      message: "الأدلة كلها محاكاة (simulated) — أضف دليل واحد على الأقل من العالم الحقيقي.",
    });
  }

  const canBuild = blockers.every((b) => b.severity !== "block");
  return { canBuild, blockers, summary };
}
