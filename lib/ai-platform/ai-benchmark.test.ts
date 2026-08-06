import { describe, it, expect } from "vitest";
import { QueueSimulator } from "@/lib/queue/simulator";
import { sanitize } from "./security/sanitizer";
import { assembleContext, chunkContext, type ContextPiece } from "./context/manager";
import { buildCacheKey, hashInput } from "./cache/keys";
import { calculateCost, type PricingRow } from "./cost/calculator";

/**
 * قياس أداء مسار الذكاء الاصطناعي عند ١٠٠ و٥٠٠ و١٠٠٠ مهمة.
 *
 * **ما يقيسه:** تكلفة كل ما يحدث حول نداء النموذج — التعقيم، وبناء
 * السياق، والتقسيم، ومفاتيح الذاكرة، وحساب التكلفة، وإدارة الطابور.
 *
 * **ما لا يقيسه — بصراحة:** زمن Gemini نفسه. القياس بنداءات حقيقية
 * يقيس المزوّد لا المنصة، ويكلّف مالًا، ويستهلك حصة مشتركة. المهم هنا
 * أن الطبقة المحيطة **لا تضيف عبئًا يُذكر** إلى نداء يستغرق ثوانٍ.
 */

const SCALES = [100, 500, 1_000];

const PRICING: PricingRow[] = [
  {
    provider: "gemini",
    model: "flash",
    inputPer1kUsd: 0.000075,
    outputPer1kUsd: 0.0003,
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
  },
];

/** حمولة واقعية: نص عربي مع مفتاح مدسوس وسياق متعدّد المصادر. */
function makePayload(index: number): { prompt: string; pieces: ContextPiece[] } {
  const secret = index % 10 === 0 ? " المفتاح: sk-abcdefghijklmnopqrstuvwxyz123456" : "";
  return {
    prompt: `حلّل المشروع رقم ${index} وحدّد المخاطر والمتطلبات.${secret}`,
    pieces: [
      { source: "الاكتشاف", content: `إجابات العميل للمشروع ${index}: `.repeat(20), weight: 10 },
      { source: "الاجتماعات", content: `محضر الاجتماع ${index}: `.repeat(30), weight: 8 },
      { source: "المعرفة", content: `مستند مرجعي ${index}: `.repeat(25), weight: 5 },
      // مكرّر عن قصد — نقيس إزالة التكرار وهي شغّالة.
      { source: "المعرفة", content: `مستند مرجعي ${index}: `.repeat(25), weight: 5 },
    ],
  };
}

interface BenchResult {
  scale: number;
  prepareMs: number;
  queueMs: number;
  totalMs: number;
  perJobMs: number;
  secretsRedacted: number;
  duplicatesRemoved: number;
  cacheHits: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function benchmark(scale: number): BenchResult {
  const sim = new QueueSimulator(0, { enforceBackpressure: false });
  const cacheKeys = new Set<string>();

  let secretsRedacted = 0;
  let duplicatesRemoved = 0;
  let cacheHits = 0;

  // ---------- التحضير: كل ما يحدث قبل النداء ----------
  const prepareStart = performance.now();
  const prepared: Array<{ prompt: string; key: string }> = [];

  for (let i = 0; i < scale; i++) {
    const payload = makePayload(i);

    const cleaned = sanitize(payload.prompt);
    secretsRedacted += cleaned.totalRedacted;

    const context = assembleContext(payload.pieces, { maxTokens: 4_000 });
    duplicatesRemoved += context.duplicatePieces;

    // التقسيم يعمل فعلًا على هذا الحجم — نقيسه لا نتخطّاه.
    chunkContext(context.pieces, 1_500);

    const key = buildCacheKey({
      taskType: "discovery",
      provider: "gemini",
      model: "flash",
      promptVersion: 1,
      inputHash: hashInput(cleaned.text + context.text),
    });

    if (cacheKeys.has(key)) cacheHits += 1;
    cacheKeys.add(key);

    calculateCost({ inputTokens: context.estimatedTokens, outputTokens: 800 }, PRICING[0]);

    prepared.push({ prompt: cleaned.text, key });
  }
  const prepareMs = performance.now() - prepareStart;

  // ---------- الطابور: الإدراج والتصريف ----------
  const queueStart = performance.now();
  for (const item of prepared) {
    sim.enqueue({ type: "ai.discovery", priority: "high", payload: { prompt: item.prompt } });
  }
  for (;;) {
    const job = sim.claim("ai-worker", ["ai.discovery"]);
    if (!job) break;
    sim.complete(job.id);
  }
  const queueMs = performance.now() - queueStart;

  return {
    scale,
    prepareMs: round(prepareMs),
    queueMs: round(queueMs),
    totalMs: round(prepareMs + queueMs),
    perJobMs: round((prepareMs + queueMs) / scale),
    secretsRedacted,
    duplicatesRemoved,
    cacheHits,
  };
}

describe("قياس أداء منصة الذكاء الاصطناعي", () => {
  const results: BenchResult[] = [];

  for (const scale of SCALES) {
    it(`${scale} مهمة: تحضير + طابور`, { timeout: 120_000 }, () => {
      const result = benchmark(scale);
      results.push(result);

      console.log(
        `[قياس AI] ${String(scale).padStart(4)} مهمة | ` +
          `تحضير ${String(result.prepareMs).padStart(8)} م.ث | ` +
          `طابور ${String(result.queueMs).padStart(8)} م.ث | ` +
          `${result.perJobMs} م.ث/مهمة`
      );

      // حارس فضفاض: الهدف كشف الانهيار لا تثبيت رقم يختلف بين الأجهزة.
      expect(result.totalMs).toBeLessThan(scale * 30);
    });
  }

  it("التعقيم شغّال فعلًا أثناء القياس", () => {
    // القياس بلا تحقّق من الصحة يقيس السرعة بلا معنى: لازم نتأكد إن
    // الطبقة الأمنية اتنفّذت مش اتخطّيت.
    const result = benchmark(100);
    expect(result.secretsRedacted).toBe(10); // مفتاح كل عاشر مهمة
    expect(result.duplicatesRemoved).toBe(100); // مقطع مكرّر لكل مهمة
  });

  it("عبء المنصة لكل مهمة أقل بمراتب من نداء النموذج", () => {
    // نداء Gemini يستغرق ثواني. لو عبء الطبقة المحيطة بالمللي ثانية،
    // فهو غير محسوس عمليًا — وده المعيار الصحيح للحكم.
    const result = benchmark(500);
    expect(result.perJobMs).toBeLessThan(50);
  });

  it("التحضير خطّي تقريبًا", () => {
    const small = benchmark(100);
    const large = benchmark(1_000);
    const ratio = large.prepareMs / Math.max(small.prepareMs, 0.01);
    expect(ratio).toBeLessThan(100); // أقل من تربيعي
  });

  it("ملخّص النتائج", () => {
    console.log("\n[قياس AI] الملخّص:");
    console.table(results);
    expect(results.length).toBe(SCALES.length);
  });
});
