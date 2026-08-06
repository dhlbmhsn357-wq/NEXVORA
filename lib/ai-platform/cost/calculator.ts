/**
 * حساب تكلفة نداءات الذكاء الاصطناعي — وحدة نقية.
 *
 * القياس هنا ليس تحسينًا: بدونه لا يمكن معرفة تكلفة أي مشروع، ولا
 * قياس عائد الذاكرة، ولا ضبط سقف إنفاق. تدقيق المرحلة الأولى كشف أن
 * `ai_requests_log` كان يسجّل `cost: null` دائمًا.
 */

export interface PricingRow {
  provider: string;
  model: string;
  inputPer1kUsd: number;
  outputPer1kUsd: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  /** هل وُجد سعر مطابق؟ `false` يعني الرقم صفر لعدم المعرفة لا لعدم التكلفة. */
  priced: boolean;
}

/** دقّة الكسور المخزَّنة — تطابق `numeric(12,6)` في القاعدة. */
const DECIMALS = 6;

function round(value: number): number {
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * يختار السعر الساري في لحظة معيّنة.
 *
 * البحث بالتاريخ لا بالأحدث: تقرير التكلفة عن الشهر الماضي يجب أن
 * يُحسب بأسعار الشهر الماضي، وإلا أعاد تغيير السعر كتابة التاريخ.
 */
export function findPricing(
  rows: PricingRow[],
  provider: string,
  model: string,
  at: Date = new Date()
): PricingRow | null {
  const candidates = rows
    .filter(
      (r) =>
        r.provider === provider &&
        r.model === model &&
        r.effectiveFrom <= at &&
        (r.effectiveTo === null || r.effectiveTo > at)
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return candidates[0] ?? null;
}

export function calculateCost(usage: TokenUsage, pricing: PricingRow | null): CostBreakdown {
  if (!pricing) {
    // صفر صريح مع علامة `priced: false` — لا يُخلط بتكلفة حقيقية صفرية.
    return { inputUsd: 0, outputUsd: 0, totalUsd: 0, priced: false };
  }

  const inputUsd = round((Math.max(0, usage.inputTokens) / 1000) * pricing.inputPer1kUsd);
  const outputUsd = round((Math.max(0, usage.outputTokens) / 1000) * pricing.outputPer1kUsd);

  return { inputUsd, outputUsd, totalUsd: round(inputUsd + outputUsd), priced: true };
}

/**
 * تقدير عدد الرموز حين لا يرجعها المزوّد.
 *
 * **تقدير خشن ومُعلَن كذلك.** النسبة تختلف بين اللغات: الإنجليزية نحو
 * أربعة أحرف للرمز، والعربية أقرب لحرفين لأن التقطيع فيها أدقّ. الخلط
 * بينهما يعطي خطأً بالضعف على نص عربي — وأغلب محتوى المنصة عربي.
 *
 * يُستخدم للتقدير قبل الإرسال فقط. القياس الفعلي دائمًا من رد المزوّد.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const arabicChars = (text.match(/[؀-ۿ]/g) ?? []).length;
  const otherChars = text.length - arabicChars;

  return Math.ceil(arabicChars / 2 + otherChars / 4);
}

/** تجميع التكاليف — للوحة والتقارير. */
export function aggregateCost(
  entries: Array<{ costUsd: number | null; cached: boolean }>
): { totalUsd: number; savedUsd: number; billedCalls: number; cachedCalls: number } {
  let totalUsd = 0;
  let savedUsd = 0;
  let billedCalls = 0;
  let cachedCalls = 0;

  for (const entry of entries) {
    const cost = entry.costUsd ?? 0;
    if (entry.cached) {
      // الإصابة توفّر ما كان سيُدفع — وهذا ما يجعل عائد الذاكرة قابلًا
      // للقياس بدل الادّعاء.
      savedUsd += cost;
      cachedCalls += 1;
    } else {
      totalUsd += cost;
      billedCalls += 1;
    }
  }

  return {
    totalUsd: round(totalUsd),
    savedUsd: round(savedUsd),
    billedCalls,
    cachedCalls,
  };
}

/** نسبة إصابة الذاكرة — `null` بلا عيّنة، لا صفر. */
export function cacheHitRate(cachedCalls: number, billedCalls: number): number | null {
  const total = cachedCalls + billedCalls;
  if (total === 0) return null;
  return cachedCalls / total;
}
