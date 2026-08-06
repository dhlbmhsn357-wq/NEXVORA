/**
 * فحص دخان لطبقة الطوابير — على قاعدة البيانات الحقيقية.
 *
 * يثبت المسار الكامل من طرف لطرف: إدراج ← تسجيل عامل ← مطالبة ذرّية ←
 * تقدّم ← نقطة توقّف ← اكتمال ← أحداث. وينظّف وراه بالكامل.
 *
 * التشغيل:
 * ```
 * npx tsx --env-file=.env.local scripts/queue-smoke.ts
 * ```
 *
 * **يتطلّب تطبيق الترحيل 0073 أولًا.**
 */

import "@/lib/queue/handlers";
import { createServiceClient } from "@/lib/supabase/service";
import { claimNextJob, completeJob, enqueue, registerWorker, reportProgress, saveCheckpoint, stopWorker } from "@/lib/queue/service";
import { handlerTypesForWorker } from "@/lib/queue/registry";

const WORKER_KEY = `smoke-${Date.now()}`;
const createdJobIds: string[] = [];

function step(n: number, label: string) {
  console.log(`\n[${n}] ${label}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`فشل: ${message}`);
  console.log(`    ✓ ${message}`);
}

async function main() {
  const supabase = createServiceClient();

  step(1, "التحقّق من وجود الجداول");
  const { error: tableError } = await supabase.from("jobs").select("id").limit(1);
  if (tableError) {
    console.error(
      `\n✗ جدول jobs غير موجود أو غير قابل للقراءة.\n` +
        `  طبّق الترحيل 0073_job_queue.sql أولًا.\n` +
        `  الخطأ: ${tableError.message}\n`
    );
    process.exit(1);
  }
  assert(true, "جدول jobs موجود");

  step(2, "تسجيل عامل");
  const types = handlerTypesForWorker("system");
  assert(types.length > 0, `السجل فيه ${types.length} نوع للعامل system`);
  await registerWorker(
    { workerKey: WORKER_KEY, workerType: "system", handledTypes: types, concurrency: 1 },
    supabase
  );
  const { data: worker } = await supabase
    .from("queue_workers")
    .select("worker_key, status")
    .eq("worker_key", WORKER_KEY)
    .maybeSingle();
  assert(worker?.worker_key === WORKER_KEY, "العامل ظهر في queue_workers");

  step(3, "إدراج مهمة");
  const enqueued = await enqueue(
    { type: "system.noop", payload: { label: "smoke" }, priority: "critical" },
    supabase
  );
  assert(enqueued.status === "created", `الإدراج نجح (${enqueued.status})`);
  if (enqueued.status !== "created") process.exit(1);
  createdJobIds.push(enqueued.job.id);
  assert(enqueued.job.status === "queued", "الحالة الابتدائية queued");

  step(4, "إسقاط التكرار");
  const dedupeA = await enqueue(
    { type: "system.noop", dedupeHash: `smoke-${WORKER_KEY}` },
    supabase
  );
  const dedupeB = await enqueue(
    { type: "system.noop", dedupeHash: `smoke-${WORKER_KEY}` },
    supabase
  );
  if (dedupeA.status === "created") createdJobIds.push(dedupeA.job.id);
  assert(dedupeB.status === "deduplicated", "الطلب المكرّر اترفض كتكرار");

  step(5, "المطالبة الذرّية");
  const claimStart = Date.now();
  const claimed = await claimNextJob(WORKER_KEY, types, supabase);
  const claimMs = Date.now() - claimStart;
  assert(claimed !== null, `المطالبة رجّعت مهمة في ${claimMs} م.ث`);
  if (!claimed) process.exit(1);
  assert(claimed.status === "running", "الحالة بقت running");
  assert(claimed.attempts === 1, "عدّاد المحاولات زاد لواحد");
  assert(claimed.worker_id === WORKER_KEY, "المهمة اتربطت بالعامل الصح");

  step(6, "التقدّم ونقطة التوقّف");
  await reportProgress(claimed.id, 50, "نص الطريق", supabase);
  await saveCheckpoint(claimed.id, { step: 5 }, supabase);
  const { data: mid } = await supabase
    .from("jobs")
    .select("progress, checkpoint")
    .eq("id", claimed.id)
    .maybeSingle();
  assert(mid?.progress === 50, "التقدّم اتسجّل");
  assert(
    (mid?.checkpoint as { step?: number } | null)?.step === 5,
    "نقطة التوقّف اتحفظت"
  );

  step(7, "الاكتمال");
  await completeJob(claimed.id, { ok: true }, { workerId: WORKER_KEY }, supabase);
  const { data: done } = await supabase
    .from("jobs")
    .select("status, progress, execution_time_ms, queue_time_ms")
    .eq("id", claimed.id)
    .maybeSingle();
  assert(done?.status === "completed", "الحالة النهائية completed");
  assert(done?.progress === 100, "التقدّم اتضبط على مئة");
  assert(
    typeof done?.execution_time_ms === "number",
    `زمن التنفيذ اتحسب بالمُشغِّل (${done?.execution_time_ms} م.ث)`
  );

  step(8, "الأحداث والسجلات");
  const { data: events } = await supabase
    .from("job_events")
    .select("to_status")
    .eq("job_id", claimed.id)
    .order("created_at");
  const statuses = (events ?? []).map((e: { to_status: string }) => e.to_status);
  assert(statuses.includes("running"), `انتقالات مسجّلة: ${statuses.join(" ← ")}`);
  assert(statuses.includes("completed"), "الاكتمال مسجّل");

  const { count: platformEvents } = await supabase
    .from("platform_events")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", `%${claimed.id}%`);
  assert((platformEvents ?? 0) > 0, `أحداث المنصة اتنشرت (${platformEvents})`);

  step(9, "دوال الصيانة");
  const { data: recovered, error: recoverError } = await supabase.rpc("recover_stuck_jobs", {
    p_heartbeat_timeout_seconds: 180,
  });
  assert(!recoverError, `recover_stuck_jobs اشتغلت (استعادت ${recovered})`);

  const { error: promoteError } = await supabase.rpc("promote_scheduled_jobs");
  assert(!promoteError, "promote_scheduled_jobs اشتغلت");

  console.log("\n✓ كل الفحوص نجحت.\n");
}

async function cleanup() {
  const supabase = createServiceClient();
  if (createdJobIds.length > 0) {
    // job_events و job_logs بتتمسح بالتتالي (on delete cascade)
    await supabase.from("jobs").delete().in("id", createdJobIds);
  }
  await stopWorker(WORKER_KEY, "انتهى فحص الدخان", supabase);
  await supabase.from("queue_workers").delete().eq("worker_key", WORKER_KEY);
  console.log(`تنظيف: اتمسحت ${createdJobIds.length} مهمة وعامل واحد.`);
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error("\n✗", err instanceof Error ? err.message : err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
