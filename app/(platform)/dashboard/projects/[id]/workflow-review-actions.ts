"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStageAction } from "@/lib/workflow/permissions";

type Decision = "approved" | "rejected";

async function setDecision(
  table: "engineering_reviews" | "monitoring_checks",
  rowId: string,
  projectId: string,
  decision: Decision
): Promise<{ ok: boolean; message?: string }> {
  const stageKey = table === "engineering_reviews" ? "engineeringQaReview" : "productionMonitoringReview";
  const auth = await requireStageAction(stageKey, "approve");
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ pm_approval_status: decision, pm_approved_by: auth.userId, pm_approved_at: new Date().toISOString() })
    .eq("id", rowId);
  if (error) return { ok: false, message: `فشل تسجيل القرار: ${error.message}` };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function decideEngineeringQaReview(reviewId: string, projectId: string, decision: Decision) {
  return setDecision("engineering_reviews", reviewId, projectId, decision);
}

export async function decideProductionMonitoringReview(checkId: string, projectId: string, decision: Decision) {
  return setDecision("monitoring_checks", checkId, projectId, decision);
}
