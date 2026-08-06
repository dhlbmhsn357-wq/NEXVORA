"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/rbac";
import { runDiscoveryAnalysisJob } from "@/lib/discovery-analysis/job-runner";

/**
 * إعادة تشغيل تحليل الاكتشاف يدويًا (للمسؤولين). التنفيذ في after()
 * عشان الـ UI يرجّع فورًا بدون انتظار (التحليل ممكن ياخد 10-30 ثانية).
 */
export async function rerunDiscoveryAnalysis(
  projectId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false, message: "المشروع غير موجود." };

  // منع الازدواج — لو فيه Job قيد التنفيذ لسه
  const svc = createServiceClient();
  const { data: latest } = await svc
    .from("discovery_analyses")
    .select("status")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && (latest.status === "pending" || latest.status === "running")) {
    return { ok: false, message: "فيه تحليل قيد التنفيذ حاليًا." };
  }

  // إنشاء صف pending فورًا (Optimistic UI) — الـ runner هيحدّثه للـ running
  const { data: job, error: insertErr } = await svc
    .from("discovery_analyses")
    .insert({
      project_id: projectId,
      status: "pending",
      created_by: auth.userId ?? null,
    })
    .select("id")
    .single();
  if (insertErr || !job) {
    return { ok: false, message: insertErr?.message ?? "تعذّر بدء التحليل." };
  }

  const jobId = job.id;
  after(async () => {
    try {
      await runDiscoveryAnalysisJob(projectId, {
        actorId: auth.userId ?? null,
        reuseJobId: jobId,
      });
    } catch (err) {
      console.error("[DiscoveryAnalysis rerun] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

/** تصريف إشعار الفشل من الجرس بدون إعادة تشغيل. */
export async function acknowledgeDiscoveryAnalysisFailure(
  analysisId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_analyses")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", analysisId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
