/**
 * NEXVORA Change Impact — Auto Trigger Hook
 * =========================================
 *
 * Server-only. Called from update server actions after an updateRequirement /
 * updateStory / updateAc mutation. Runs:
 *   1. Material-change detection (pure) — skips work when nothing important
 *      changed
 *   2. Marks impacted downstream items with status='needs_review' (idempotent
 *      — items already in a non-approved state stay put)
 *   3. Emits a notification via NotificationService with a dedupeKey per
 *      (source, changeType) so multiple rapid edits don't spam users
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { computeImpact } from "./derive";
import { isMaterialChange, type ChangeImpactTable } from "./detect";
import { listRequirements } from "@/lib/product-definition/service";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { listScenarios } from "@/lib/evaluation/service";
import { listEvidenceLinks } from "@/lib/evidence/service";
import { NotificationService } from "@/lib/notifications/service";

type SourceType = "requirement" | "user_story" | "acceptance_criterion";

const TABLE_TO_SOURCE: Record<ChangeImpactTable, SourceType> = {
  product_requirements: "requirement",
  user_stories: "user_story",
  acceptance_criteria: "acceptance_criterion",
};

export interface AutoTriggerResult {
  triggered: boolean;
  markedNeedsReview: {
    stories: number;
    acs: number;
    scenarios: number;
  };
}

export async function autoTriggerChangeImpact(params: {
  table: ChangeImpactTable;
  projectId: string;
  sourceId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  actorId: string | null;
}): Promise<AutoTriggerResult> {
  const { table, projectId, sourceId, before, after, actorId } = params;
  const material = isMaterialChange(table, before, after);
  const result: AutoTriggerResult = {
    triggered: material,
    markedNeedsReview: { stories: 0, acs: 0, scenarios: 0 },
  };
  if (!material) return result;

  const [requirements, stories, acs, scenarios, evidence] = await Promise.all([
    listRequirements(projectId),
    listStories(projectId),
    listAcceptanceCriteria(projectId),
    listScenarios(projectId),
    listEvidenceLinks(projectId).catch(() => []),
  ]);

  const impact = computeImpact(TABLE_TO_SOURCE[table], sourceId, {
    requirements, stories, acs, scenarios,
    evidence: evidence as Parameters<typeof computeImpact>[2]["evidence"],
  });

  const svc = createServiceClient();
  // Idempotent — only touch rows that are currently approved-ish.
  if (impact.directStories.length > 0) {
    const ids = impact.directStories.map((i) => i.id);
    const { data } = await svc
      .from("user_stories")
      .update({ status: "needs_review" })
      .in("id", ids)
      .in("status", ["approved", "in_dev", "in_review", "done"])
      .select("id");
    result.markedNeedsReview.stories = (data ?? []).length;
  }
  if (impact.directAcs.length > 0) {
    const ids = impact.directAcs.map((i) => i.id);
    const { data } = await svc
      .from("acceptance_criteria")
      .update({ status: "needs_review" })
      .in("id", ids)
      .in("status", ["approved", "verified"])
      .select("id");
    result.markedNeedsReview.acs = (data ?? []).length;
  }
  if (impact.directEvaluations.length > 0) {
    const ids = impact.directEvaluations.map((i) => i.id);
    const { data } = await svc
      .from("evaluation_scenarios")
      .update({ status: "needs_review" })
      .in("id", ids)
      .in("status", ["approved"])
      .select("id");
    result.markedNeedsReview.scenarios = (data ?? []).length;
  }

  // Fire-and-forget notification. dedupeKey collapses rapid edits.
  await NotificationService.emit({
    dedupeKey: `change_impact:${sourceId}`,
    type: "change_impact",
    category: "work",
    severity: "warning",
    projectId,
    title: "تأثير تغيير — عناصر بحاجة إلى مراجعة",
    message:
      `تم تحديث ${TABLE_TO_SOURCE[table]} — ` +
      `${result.markedNeedsReview.stories} قصص، ${result.markedNeedsReview.acs} AC، ${result.markedNeedsReview.scenarios} scenarios علّمت needs_review.`,
    targetUrl: `/dashboard/projects/${projectId}`,
    targetRecordId: sourceId,
    targetContext: { actorId, sourceType: TABLE_TO_SOURCE[table] },
  }).catch(() => {/* notifications are non-fatal */});

  return result;
}
