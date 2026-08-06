"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { collectQueueOverview, collectWorkerSnapshots, toHealthSnapshot } from "@/lib/queue/metrics";
import { assessSystem, type HealthReport, type WorkerSnapshot } from "@/lib/queue/health";
import { cancelJob, listJobs, requeueFromDeadLetter } from "@/lib/queue/service";
import type { QueueOverview } from "@/lib/queue/metrics";
import type { JobRow, JobStatus } from "@/lib/queue/types";

/**
 * إجراءات لوحة الطوابير — داخلية بالكامل.
 *
 * **لم تُعدَّل أي واجهة برمجية عامة.** كل ما هنا جديد ومقصور على
 * المسؤولين، لأن اللوحة تكشف أحمال النظام وأخطاءه عبر كل المشاريع.
 */

const ADMIN_ONLY = ["owner", "admin"] as const;

export interface QueueDashboardData {
  overview: QueueOverview;
  workers: WorkerSnapshot[];
  health: HealthReport;
  recentJobs: JobRow[];
  deadLetters: Array<{
    job_id: string;
    job_type: string;
    final_error: string | null;
    attempts: number;
    moved_at: string;
  }>;
}

export async function getQueueDashboard(
  filter: { status?: JobStatus[] } = {}
): Promise<{ ok: boolean; message?: string; data?: QueueDashboardData }> {
  const auth = await requireRole([...ADMIN_ONLY]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();

  const [overview, workers, recentJobs, deadLetters] = await Promise.all([
    collectQueueOverview(supabase),
    collectWorkerSnapshots(supabase),
    listJobs({ status: filter.status, limit: 50 }, supabase),
    supabase
      .from("job_dead_letters")
      .select("job_id, job_type, final_error, attempts, moved_at")
      .is("reviewed_at", null)
      .order("moved_at", { ascending: false })
      .limit(20),
  ]);

  return {
    ok: true,
    data: {
      overview,
      workers,
      health: assessSystem(toHealthSnapshot(overview), workers),
      recentJobs,
      deadLetters: (deadLetters.data ?? []) as QueueDashboardData["deadLetters"],
    },
  };
}

export async function cancelJobAction(
  jobId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...ADMIN_ONLY]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await cancelJob(jobId, auth.userId ?? null);
  if (result.ok) revalidatePath("/dashboard/queue");
  return result;
}

export async function requeueDeadLetterAction(
  jobId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...ADMIN_ONLY]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!auth.userId) return { ok: false, message: "تعذّر تحديد المستخدم." };

  const result = await requeueFromDeadLetter(jobId, auth.userId);
  if (result.status === "rejected") return { ok: false, message: result.reason };

  revalidatePath("/dashboard/queue");
  return { ok: true };
}
