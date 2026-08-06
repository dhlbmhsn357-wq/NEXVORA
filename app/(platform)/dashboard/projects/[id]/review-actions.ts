"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PrototypeReviewEngine, type ReviewRunResult } from "@/lib/review/review-service";
import { applyManualOverride } from "@/lib/review/versioning";
import type { GapReport, PrototypeReviewVersion } from "@/lib/types/database";

async function getActorId(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

/**
 * تشغيل مراجعة كـ Background Job: بنحجز الـ Lock ونرجّع فورًا
 * ("started")، والمراجعة الفعلية (قراءة الـ Repository + استدعاء AI مع
 * الانتظار الصبور على Rate Limit) بتحصل في after() — نفس أسلوب PRD/
 * Prototype Prompt/Client Presentation/Developer Handoff.
 */
export async function runPrototypeReview(
  projectId: string,
  repoUrl: string,
  repoRef: string
): Promise<ReviewRunResult> {
  const actorId = await getActorId();

  const claimed = await PrototypeReviewEngine.tryClaimLock(projectId);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_reviewing" };
  }

  after(async () => {
    try {
      await PrototypeReviewEngine.runReviewCore(projectId, repoUrl, repoRef || "main", actorId);
    } catch (err) {
      console.error("[PrototypeReview background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function overrideReviewItem(
  projectId: string,
  itemKind: "user_stories" | "acceptance_criteria_results",
  index: number,
  status: string,
  note: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const actorId = await getActorId();

  const { data: review } = await supabase
    .from("prototype_review")
    .select("gap_report")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!review) return { ok: false };

  const report = review.gap_report as GapReport;
  const items = report[itemKind];
  if (!items[index]) return { ok: false };

  items[index] = {
    ...items[index],
    pm_override: {
      status: status as GapReport["user_stories"][number]["ai_status"],
      note: note || undefined,
      overridden_by: actorId ?? null,
      overridden_at: new Date().toISOString(),
    },
  };

  await applyManualOverride(supabase, projectId, report, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getReviewVersions(projectId: string): Promise<PrototypeReviewVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prototype_review_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as PrototypeReviewVersion[];
}
