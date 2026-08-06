import { describe, it, expect } from "vitest";
import { QueueSimulator } from "./simulator";
import { sortByExecutionOrder } from "./priority";
import type { JobPriority } from "./types";

/**
 * قياس أداء طبقة الطوابير عند ١٠٠ و٥٠٠ و١٠٠٠ و٥٠٠٠ مهمة.
 *
 * **ما يقيسه:** تكلفة منطق الطابور نفسه — الإدراج والترتيب والمطالبة
 * وإسقاط التكرار وقرارات إعادة المحاولة. القياس بمهام فارغة عن قصد:
 * القياس بمهام حقيقية بيقيس الذكاء الاصطناعي والشبكة، مش البنية.
 *
 * **ما لا يقيسه — بصراحة:** أداء PostgreSQL، وسلوك `SKIP LOCKED` تحت
 * تزامن حقيقي، وزمن الشبكة، وتكلفة الفهارس عند ملايين الصفوف. دي
 * محتاجة قياسًا على قاعدة حقيقية بعد نشر الترحيل، وهي **ليست** جزءًا
 * من نتائج المرحلة دي.
 *
 * الأرقام تُطبَع عند التشغيل وتُوثَّق في `docs/queue-architecture.md`.
 */

const SCALES = [100, 500, 1_000, 5_000];
const PRIORITIES: JobPriority[] = ["critical", "high", "normal", "low", "background"];

interface BenchResult {
  scale: number;
  enqueueMs: number;
  drainMs: number;
  totalMs: number;
  enqueuePerSec: number;
  drainPerSec: number;
}

function benchmark(scale: number): BenchResult {
  // الضغط العكسي مطفّي هنا عن قصد: لو شغّال، "٥٠٠٠ مهمة" بتتحوّل
  // لـ٢٠٠٠ فعليًا لأن المنخفضة بتترفض بعد العتبة — ورقم مضلِّل أسوأ
  // من مفيش رقم.
  const sim = new QueueSimulator(0, { enforceBackpressure: false });

  const enqueueStart = performance.now();
  for (let i = 0; i < scale; i++) {
    sim.enqueue({
      type: "system.noop",
      // توزيع الأولويات بيخلّي الترتيب شغّال فعلًا بدل ما يبقى قائمة
      // متجانسة — القياس على حالة متجانسة بيخفي تكلفة الترتيب.
      priority: PRIORITIES[i % PRIORITIES.length],
      payload: { index: i },
    });
  }
  const enqueueMs = performance.now() - enqueueStart;

  const drainStart = performance.now();
  let drained = 0;
  for (;;) {
    const job = sim.claim("bench-worker", ["system.noop"]);
    if (!job) break;
    sim.reportProgress(job.id, 50);
    sim.complete(job.id);
    drained++;
  }
  const drainMs = performance.now() - drainStart;

  return {
    scale,
    enqueueMs: round(enqueueMs),
    drainMs: round(drainMs),
    totalMs: round(enqueueMs + drainMs),
    enqueuePerSec: Math.round(scale / (enqueueMs / 1000)),
    drainPerSec: Math.round(drained / (drainMs / 1000)),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("قياس الأداء — الطابور", () => {
  const results: BenchResult[] = [];

  for (const scale of SCALES) {
    // مهلة صريحة: القياس بيتنافس على المعالج مع بقية ملفات الاختبار
    // المتوازية، ومهلة الخمس ثواني الافتراضية كانت بتفشل عشوائيًا عند
    // ٥٠٠٠ — فشل توقيت لا فشل منطق.
    it(`${scale} مهمة: إدراج ثم تصريف كامل`, { timeout: 120_000 }, () => {
      const result = benchmark(scale);
      results.push(result);

      console.log(
        `[قياس] ${String(scale).padStart(5)} مهمة | ` +
          `إدراج ${String(result.enqueueMs).padStart(8)} م.ث (${result.enqueuePerSec}/ث) | ` +
          `تصريف ${String(result.drainMs).padStart(9)} م.ث (${result.drainPerSec}/ث)`
      );

      // حارس انحدار فضفاض عن قصد: الهدف كشف الانهيار (تعقيد تربيعي
      // مثلًا)، لا تثبيت رقم يختلف بين الأجهزة فيكسر البناء بلا سبب.
      expect(result.totalMs).toBeLessThan(scale * 20);
    });
  }

  it("الإدراج خطّي تقريبًا مع الحجم", { timeout: 120_000 }, () => {
    // الإدراج بيفحص عمق الطابور وبصمة التكرار — لو التنفيذ ساذج
    // بيبقى تربيعيًا، وده بيبان هنا فورًا.
    const small = benchmark(100);
    const large = benchmark(1_000);

    const ratio = large.enqueueMs / Math.max(small.enqueueMs, 0.01);
    // عشرة أضعاف الحجم لازم تدّي أقل من مئة ضعف الزمن — أي أقل من تربيعي.
    expect(ratio).toBeLessThan(100);
  });

  it("الترتيب عند ٥٠٠٠ عنصر يفضل تحت مئة مللي ثانية", () => {
    const now = new Date();
    const jobs = Array.from({ length: 5_000 }, (_, i) => ({
      priority: PRIORITIES[i % PRIORITIES.length],
      createdAt: new Date(now.getTime() - i * 1000),
    }));

    const start = performance.now();
    const sorted = sortByExecutionOrder(jobs, now);
    const elapsed = performance.now() - start;

    console.log(`[قياس] ترتيب ٥٠٠٠ مهمة: ${round(elapsed)} م.ث`);

    expect(sorted).toHaveLength(5_000);
    expect(elapsed).toBeLessThan(100);
  });

  it("إسقاط التكرار يفضل صحيحًا عند الحجم الكبير", () => {
    const sim = new QueueSimulator(0, { enforceBackpressure: false });
    // ألف طلب على مئة بصمة فقط = تسعمئة إسقاط متوقَّع.
    for (let i = 0; i < 1_000; i++) {
      sim.enqueue({ type: "system.noop", dedupeHash: `hash-${i % 100}` });
    }
    expect(sim.jobs.size).toBe(100);
  });

  it("مفيش معالجة مزدوجة عند ألف مهمة وعشرين عاملًا", { timeout: 120_000 }, () => {
    const sim = new QueueSimulator(0, { enforceBackpressure: false });
    for (let i = 0; i < 1_000; i++) sim.enqueue({ type: "system.noop" });

    const claimed = new Set<string>();
    let duplicates = 0;

    for (;;) {
      let anyClaimed = false;
      for (let w = 0; w < 20; w++) {
        const job = sim.claim(`w${w}`, ["system.noop"]);
        if (!job) continue;
        anyClaimed = true;
        if (claimed.has(job.id)) duplicates++;
        claimed.add(job.id);
        sim.complete(job.id);
      }
      if (!anyClaimed) break;
    }

    expect(duplicates).toBe(0);
    expect(claimed.size).toBe(1_000);
  });

  it("ملخّص النتائج", () => {
    console.log("\n[قياس] الملخّص:");
    console.table(results);
    expect(results.length).toBe(SCALES.length);
  });
});
