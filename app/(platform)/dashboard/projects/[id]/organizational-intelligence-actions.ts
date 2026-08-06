"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireManageKnowledge, requireViewKnowledge } from "@/lib/organizational-intelligence/permissions";
import { RecommendationsEngine } from "@/lib/organizational-intelligence/recommendations-service";
import { AIProductAdvisor } from "@/lib/organizational-intelligence/advisor-service";
import { syncAcceptedRecommendationsToBrain } from "@/lib/brain-v2/recommendations-integration";
import { createServiceClient } from "@/lib/supabase/service";
import type { ProductAdvisorAnalysis, RecommendationStatus, RecommendationVersion } from "@/lib/types/database";

export async function setRecommendationStatusAction(
  projectId: string,
  recommendationId: string,
  status: RecommendationStatus,
  reason?: string
): Promise<{ ok: boolean; message?: string; brainMessage?: string }> {
  const auth = await requireManageKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  await RecommendationsEngine.setStatus(recommendationId, status, auth.userId ?? null, reason ?? null);

  // قبول توصية = اعتمادها فعليًا، فبتتكتب فورًا في مسودة Project Brain
  // بدل ما تفضل رقمًا في لوحة منفصلة. فشل الكتابة مش بيلغي القبول —
  // بنرجّع سببه للواجهة عشان يظهر للمستخدم بوضوح.
  let brainMessage: string | undefined;
  if (status === "accepted") {
    const sync = await syncAcceptedRecommendationsToBrain(projectId, auth.userId ?? null);
    brainMessage = sync.ok
      ? sync.addedCount > 0
        ? `اتضافت ${sync.addedCount} توصية للـ Brain.`
        : sync.backfilledCount > 0
          ? `اتصلّح مصدر ${sync.backfilledCount} عنصر في الـ Brain.`
          : "التوصية موجودة أصلًا في الـ Brain."
      : sync.message;
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, brainMessage };
}

/**
 * إضافة كل التوصيات المقبولة + القرار المعماري لمسودة Project Brain
 * دفعة واحدة — مفيدة للتوصيات اللي اتقبلت قبل ما الربط ده يتعمل.
 */
export async function syncRecommendationsToBrainAction(
  projectId: string
): Promise<{ ok: boolean; message: string }> {
  const auth = await requireManageKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const result = await syncAcceptedRecommendationsToBrain(projectId, auth.userId ?? null);
  revalidatePath(`/dashboard/projects/${projectId}`);

  if (!result.ok) return { ok: false, message: result.message };

  const parts: string[] = [];
  if (result.addedCount > 0) parts.push(`اتضافت ${result.addedCount} توصية معمارية وفنية`);
  if (result.backfilledCount > 0) parts.push(`اتصلّح مصدر ${result.backfilledCount} عنصر مضاف قبل كده`);

  return {
    ok: true,
    message: parts.length > 0 ? `${parts.join(" و")} في الـ Brain.` : "كل التوصيات المقبولة موجودة أصلًا في الـ Brain.",
  };
}

export type GenerateRecommendationsResult =
  | { status: "done"; generated: number }
  | { status: "skipped"; message: string }
  | { status: "error"; message: string };

/**
 * توليد عند الطلب — متزامن (يرث maxDuration=260 من صفحة المشروع) عشان
 * النتيجة الحقيقية توصل للمستخدم: قبل كده كان بيشتغل في الخلفية ويقول
 * "جاري التوليد" حتى لو الـ Engine تخطّى التوليد بصمت (مفيش Brain/دليل)،
 * فكان الزر شكله "مبيعملش حاجة". دلوقتي يا توصيات فعلية يا سبب واضح.
 */
export async function generateRecommendationsAction(projectId: string): Promise<GenerateRecommendationsResult> {
  const auth = await requireManageKnowledge();
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مسموح." };

  try {
    const result = await RecommendationsEngine.generateForProject(projectId, auth.userId ?? null);
    revalidatePath(`/dashboard/projects/${projectId}`);
    if ("skipped" in result) return { status: "skipped", message: result.skipped };
    return { status: "done", generated: result.generated };
  } catch (err) {
    console.error("[RecommendationsEngine] failed:", err);
    return { status: "error", message: err instanceof Error ? err.message : "فشل توليد التوصيات." };
  }
}

export async function getRecommendationVersionsAction(recommendationId: string): Promise<{ ok: true; versions: RecommendationVersion[] } | { ok: false; message: string }> {
  const auth = await requireViewKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("recommendation_versions")
    .select("*")
    .eq("recommendation_id", recommendationId)
    .order("version", { ascending: false });
  return { ok: true, versions: (data as RecommendationVersion[] | null) ?? [] };
}

export type StartAdvisorAnalysisResult = { status: "started" } | { status: "already_generating" } | { status: "error"; message: string };

export async function startAdvisorAnalysisAction(projectId: string): Promise<StartAdvisorAnalysisResult> {
  const auth = await requireViewKnowledge();
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مسموح." };

  const result = await AIProductAdvisor.startAnalysis(projectId);
  if (result.status !== "started") {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return result;
  }

  after(async () => {
    try {
      await AIProductAdvisor.runAnalysisCore(projectId);
    } catch (err) {
      console.error("[AIProductAdvisor background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getAdvisorAnalysisState(projectId: string): Promise<{ ok: true; analysis: ProductAdvisorAnalysis | null } | { ok: false; message: string }> {
  const auth = await requireViewKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const { analysis } = await AIProductAdvisor.getState(projectId);
  return { ok: true, analysis };
}
