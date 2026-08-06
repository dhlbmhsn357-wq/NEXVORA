/**
 * محلّل الفروق (Difference Analyzer) — **وحدة نقية بلا I/O**.
 *
 * يقارن عدد السجلات: المصدر ← الهدف المحاكى، لكل كيان. الفرق **المتوقَّع**
 * هو ما جرى تخطّيه/أرشفته/فشله عمدًا؛ أي فرق زائد على ذلك = **غير متوقَّع**
 * (فقدان صامت) يستحق التحقيق.
 */

import type { EntityBreakdown, CountDiff, DifferenceReport } from "./simulation-types";

export function analyzeDifferences(byEntity: EntityBreakdown[]): DifferenceReport {
  const counts: CountDiff[] = [];
  let totalOld = 0;
  let totalNew = 0;
  let unexpectedCount = 0;

  for (const e of byEntity) {
    const oldValue = e.sourceRows;
    const newValue = e.targetRows;
    const difference = oldValue - newValue;
    const intentional = e.skipped + e.archived + e.failed;
    const expected = difference === intentional;
    if (!expected) unexpectedCount++;

    totalOld += oldValue;
    totalNew += newValue;

    counts.push({
      entity: e.entity,
      label: e.label,
      oldValue,
      newValue,
      difference,
      expected,
      reason: expected
        ? intentional === 0
          ? "تطابق تامّ — كل السجلات رُحّلت."
          : `فرق مبرَّر: ${e.skipped} تخطّي + ${e.archived} أرشفة + ${e.failed} فشل.`
        : `فرق غير مفسَّر (${difference}) يتجاوز المستبعَد عمدًا (${intentional}) — احتمال فقدان صامت.`,
    });
  }

  return { counts, totalOld, totalNew, totalDifference: totalOld - totalNew, unexpectedCount };
}
