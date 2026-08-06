/**
 * قياس أداء الطابور على قاعدة البيانات الحقيقية.
 *
 * ده اللي **مش** بيقيسه قياس المحاكي: أداء PostgreSQL، وسلوك
 * `for update skip locked`، وزمن الشبكة، وفعّالية الفهرس الجزئي.
 *
 * التشغيل:
 * ```
 * npx tsx --env-file=.env.local scripts/queue-benchmark-db.ts [عدد]
 * ```
 *
 * **تحذير النقل الصادر:** كل مهمة = عدة رحلات شبكة ذهابًا وإيابًا.
 * الافتراضي ١٠٠ عن قصد — المشروع متجاوز حصة النقل الصادر تسعة أضعاف،
 * فقياس بألف مهمة يضيف حملًا حقيقيًا بلا فائدة تشخيصية إضافية.
 *
 * السكربت بينظّف وراه بالكامل.
 */

import "@/lib/queue/handlers";
import { createServiceClient } from "@/lib/supabase/service";
import { claimNextJob, completeJob, enqueue, registerWorker, stopWorker } from "@/lib/queue/service";
import { handlerTypesForWorker } from "@/lib/queue/registry";
import type { JobPriority } from "@/lib/queue/types";

const SCALE = Math.max(10, Math.min(Number(process.argv[2] ?? 100), 1_000));
const WORKER_KEY = `bench-${Date.now()}`;
const PRIORITIES: JobPriority[] = ["critical", "high", "normal", "low", "background"];

const createdIds: string[] = [];

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[index]);
}

/**
 * الزمن المرجعي لرحلة شبكة واحدة.
 *
 * من غيره الأرقام بلا معنى: القياس من جهاز بعيد بيقيس المسافة مش قاعدة
 * البيانات. الحد المعماري (١٠٠ م.ث) مقصود به **عاملًا داخل نفس منطقة
 * القاعدة**، فالمقارنة لازم تكون بعدد الرحلات لا بالمللي ثانية الخام —
 * وإلا الإنذار كاذب دائمًا.
 */
async function measureBaselineRtt(supabase: ReturnType<typeof createServiceClient>) {
  const times: number[] = [];
  await supabase.from("jobs").select("id").limit(1); // إحماء
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    await supabase.from("jobs").select("id").limit(1);
    times.push(Date.now() - t0);
  }
  return percentile(times, 50);
}

async function main() {
  const supabase = createServiceClient();

  const { error: tableError } = await supabase.from("jobs").select("id").limit(1);
  if (tableError) {
    console.error(`✗ جدول jobs غير موجود — طبّق الترحيل 0073 أولًا.\n  ${tableError.message}`);
    process.exit(1);
  }

  const types = handlerTypesForWorker("system");
  await registerWorker(
    { workerKey: WORKER_KEY, workerType: "system", handledTypes: types, concurrency: 1 },
    supabase
  );

  const rtt = await measureBaselineRtt(supabase);
  console.log(`\nالزمن المرجعي لرحلة شبكة واحدة: ${rtt} م.ث`);
  console.log(`قياس ${SCALE} مهمة على قاعدة البيانات الحقيقية…\n`);

  // ---------- الإدراج ----------
  const enqueueLatencies: number[] = [];
  const enqueueStart = Date.now();

  for (let i = 0; i < SCALE; i++) {
    const t0 = Date.now();
    const result = await enqueue(
      {
        type: "system.noop",
        priority: PRIORITIES[i % PRIORITIES.length],
        payload: { bench: WORKER_KEY, index: i },
      },
      supabase
    );
    enqueueLatencies.push(Date.now() - t0);
    if (result.status === "created") createdIds.push(result.job.id);
  }

  const enqueueTotalMs = Date.now() - enqueueStart;

  // ---------- المطالبة والاكتمال ----------
  const claimLatencies: number[] = [];
  const drainStart = Date.now();
  let drained = 0;

  for (;;) {
    const t0 = Date.now();
    const job = await claimNextJob(WORKER_KEY, types, supabase);
    const claimMs = Date.now() - t0;
    if (!job) break;

    // مهام القياس بس — لو الطابور فيه شغل حقيقي مانلمسوش.
    if ((job.payload as { bench?: string }).bench !== WORKER_KEY) {
      console.warn(`  تخطّي مهمة مش بتاعة القياس: ${job.id}`);
      continue;
    }

    claimLatencies.push(claimMs);
    await completeJob(job.id, { ok: true }, { workerId: WORKER_KEY }, supabase);
    drained++;
  }

  const drainTotalMs = Date.now() - drainStart;

  // ---------- النتائج ----------
  console.log("الإدراج:");
  console.log(`  الإجمالي        ${enqueueTotalMs} م.ث لـ ${createdIds.length} مهمة`);
  console.log(`  المعدّل         ${Math.round(createdIds.length / (enqueueTotalMs / 1000))} مهمة/ث`);
  console.log(`  الوسيط (م٥٠)    ${percentile(enqueueLatencies, 50)} م.ث`);
  console.log(`  م٩٥            ${percentile(enqueueLatencies, 95)} م.ث`);

  console.log("\nالمطالبة + الاكتمال:");
  console.log(`  الإجمالي        ${drainTotalMs} م.ث لـ ${drained} مهمة`);
  console.log(`  المعدّل         ${Math.round(drained / (drainTotalMs / 1000))} مهمة/ث`);
  console.log(`  زمن المطالبة م٥٠ ${percentile(claimLatencies, 50)} م.ث`);
  console.log(`  زمن المطالبة م٩٥ ${percentile(claimLatencies, 95)} م.ث`);

  // ---------- التقييم بعد طرح الشبكة ----------
  const p95 = percentile(claimLatencies, 95);
  const roundTrips = p95 / Math.max(rtt, 1);
  // ٥ م.ث زمن رحلة نموذجي داخل نفس المنطقة (عامل Railway ← قاعدة Supabase)
  const projectedSameRegionMs = Math.round(roundTrips * 5);

  console.log("\nالتقييم بعد طرح زمن الشبكة:");
  console.log(`  رحلات الشبكة لكل مطالبة   ${roundTrips.toFixed(1)}`);
  console.log(`  المتوقَّع داخل نفس المنطقة ~${projectedSameRegionMs} م.ث`);
  console.log(
    `  حد المراجعة المعماري      ${projectedSameRegionMs < 100 ? "✓ تحته" : "⚠ تجاوزه — راجع الفهرسة"}`
  );
  console.log(`  (الخام ${p95} م.ث — أغلبه مسافة، لا عمل قاعدة بيانات)`);

  console.log(`\nالسلامة: اتدرج ${createdIds.length}، واتنفّذ ${drained}.`);
  if (drained !== createdIds.length) {
    console.warn("⚠ العدد مش متطابق — راجع الأسباب قبل الاعتماد على الأرقام.");
  }
}

async function cleanup() {
  const supabase = createServiceClient();
  // على دفعات: `.in()` بتتحوّل لـ query string، والرابط الطويل بيرجّع 500.
  for (let i = 0; i < createdIds.length; i += 50) {
    await supabase.from("jobs").delete().in("id", createdIds.slice(i, i + 50));
  }
  await stopWorker(WORKER_KEY, "انتهى القياس", supabase);
  await supabase.from("queue_workers").delete().eq("worker_key", WORKER_KEY);
  console.log(`تنظيف: اتمسحت ${createdIds.length} مهمة وعامل واحد.`);
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error("\n✗", err instanceof Error ? err.message : err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
