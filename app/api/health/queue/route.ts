import { NextResponse } from "next/server";
import { collectQueueOverview, collectWorkerSnapshots, toHealthSnapshot } from "@/lib/queue/metrics";
import { assessSystem } from "@/lib/queue/health";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * فحص صحة الطابور والعمال.
 *
 * **ما لا يُسرَّب هنا:** أي حمولة مهمة أو معرّف مشروع أو رسالة خطأ
 * تفصيلية. المخرَج أعداد وحالات فقط — المسار مفتوح لأنظمة المراقبة،
 * والتفاصيل في اللوحة المحمية بالدور.
 */
export async function GET() {
  try {
    const [overview, workers] = await Promise.all([
      collectQueueOverview(),
      collectWorkerSnapshots(),
    ]);

    const health = assessSystem(toHealthSnapshot(overview), workers);

    return NextResponse.json(
      {
        ok: health.level === "healthy",
        level: health.level,
        queueDepth: health.queueDepth,
        failureRate: health.failureRate,
        counts: overview.countsByStatus,
        oldestWaitingMs: overview.oldestWaitingMs,
        avgExecutionMs: overview.avgExecutionMs,
        avgQueueMs: overview.avgQueueMs,
        deadLetters: overview.deadLetterCount,
        workers: workers.map((w) => ({
          type: w.workerType,
          status: w.status,
          heartbeatAgeMs: w.heartbeatAgeMs,
          activeJobs: w.activeJobs,
          concurrency: w.concurrency,
        })),
        issues: health.issues,
      },
      { status: health.level === "critical" ? 503 : 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        level: "critical",
        problem: err instanceof Error ? err.message : "تعذّر قراءة حالة الطابور.",
      },
      { status: 503 }
    );
  }
}
