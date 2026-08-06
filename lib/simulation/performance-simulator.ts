/**
 * محاكاة الأداء (Performance Simulation) — **وحدة نقية بلا I/O**.
 *
 * يستقرئ من العيّنة إلى ملايين السجلات: الزمن المتوقَّع، ذروة الذاكرة/المعالج،
 * التخزين، النطاق، وزمن التوقّف. ويقترح أفضل Batch/Queue/Parallelism/Retry/
 * Resume. تقديرات هندسية حتمية (لا تشغيل فعلي).
 */

import type { EntityPlan, PerformanceReport, PerfScenario, BatchStrategy } from "./simulation-types";

interface PerfInput {
  entities: EntityPlan[];
  totalSourceRows: number;
  /** متوسّط حجم الصفّ بالبايت (يُقاس من العيّنة في الخدمة). */
  avgRowBytes: number;
  /** عدد القواعد الثقيلة (calculated/formula/reference_lookup). */
  heavyRules: number;
  totalRules: number;
}

const HEAVY_KINDS = new Set(["calculated", "formula", "reference_lookup", "convert_currency"]);

export function heavyRuleCount(entities: EntityPlan[]): number {
  let n = 0;
  for (const e of entities) for (const r of e.rules) if (HEAVY_KINDS.has(r.kind)) n++;
  return n;
}

export function simulatePerformance(input: PerfInput): PerformanceReport {
  const rulesPerRow = input.totalSourceRows > 0 ? input.totalRules : 1;
  // ميكروثانية/صفّ: أساس + وزن القواعد الثقيلة.
  const perRowMicros = Math.max(5, 3 + rulesPerRow * 1 + input.heavyRules * 6);
  const avgRowBytes = Math.max(80, input.avgRowBytes);

  const targets = [
    { label: "العيّنة الحالية", rows: input.totalSourceRows || 100 },
    { label: "١٠٠ ألف", rows: 100_000 },
    { label: "مليون", rows: 1_000_000 },
    { label: "١٠ ملايين", rows: 10_000_000 },
  ];

  const strategy = pickStrategy(avgRowBytes, input.heavyRules);

  const scenarios: PerfScenario[] = targets.map((t) => {
    const seconds = Math.max(1, Math.round((t.rows * perRowMicros) / 1_000_000 / Math.max(1, strategy.parallelism)));
    const peakMemoryMb = Math.round((strategy.batchSize * avgRowBytes) / (1024 * 1024) * strategy.parallelism) + 32;
    // زمن التوقّف ≈ زمن التنفيذ (مع Delta شبكة). الترحيل على دفعات يقلّله.
    const estimatedDowntimeSeconds = Math.round(seconds * 1.15);
    return { label: t.label, rows: t.rows, estimatedSeconds: seconds, peakMemoryMb, estimatedDowntimeSeconds };
  });

  const notes: string[] = [];
  if (input.heavyRules > 0) notes.push(`${input.heavyRules} قاعدة ثقيلة (محسوبة/بحث مرجعي) ترفع زمن الصفّ — فكّر في التخزين المؤقّت.`);
  if (avgRowBytes > 2048) notes.push("حجم الصفّ كبير — قلّل Batch Size لتفادي ضغط الذاكرة.");
  notes.push("التقديرات على دفعات متوازية؛ الشبكة البطيئة/الموارد المحدودة تزيدها.");

  const big = scenarios[2]; // مليون
  return {
    perRowMicros,
    avgRowBytes,
    scenarios,
    peakCpuPercent: Math.min(95, 40 + input.heavyRules * 5 + strategy.parallelism * 4),
    storageEstimateMb: Math.round((1_000_000 * avgRowBytes) / (1024 * 1024)),
    bandwidthEstimateMb: Math.round((big.rows * avgRowBytes) / (1024 * 1024)),
    strategy,
    notes,
  };
}

/** يقترح إستراتيجية دفعات مثلى حسب حجم الصفّ والقواعد الثقيلة. */
export function pickStrategy(avgRowBytes: number, heavyRules: number): BatchStrategy {
  let batchSize = 2000;
  if (avgRowBytes > 4096) batchSize = 500;
  else if (avgRowBytes > 2048) batchSize = 1000;
  else if (avgRowBytes < 256) batchSize = 5000;
  if (heavyRules > 10) batchSize = Math.max(250, Math.round(batchSize / 2));

  const parallelism = heavyRules > 20 ? 3 : avgRowBytes > 4096 ? 4 : 6;
  return {
    batchSize,
    queueSize: batchSize * parallelism * 2,
    parallelism,
    retryStrategy: "تراجع أُسّي (Exponential backoff) مع ٣ محاولات لكل دفعة.",
    resumeStrategy: "نقاط تحقّق (Checkpoints) لكل دفعة عبر الطابور — الاستئناف من آخر دفعة ناجحة.",
  };
}
