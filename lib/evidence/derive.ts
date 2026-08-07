/**
 * NEXVORA Evidence Traceability — Pure Derivations (P8)
 * =====================================================
 * دوال نقيّة (بدون I/O) للتحليل والعرض:
 *   • groupBySource         — تجميع الروابط لكل عنصر مستنِد
 *   • countBySource         — عدّاد سريع (source_id → count)
 *   • summarizeCoverage     — نسبة تغطية الأدلة لمجموعة عناصر
 *   • deriveEvidenceHealth  — مؤشر جودة الاستناد (نسبة الروابط ذات note)
 */
import type { EvidenceLinkRow, EvidenceSourceType } from "./types";

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------
/**
 * Map من source_id إلى الروابط. مفيد للـ UI لعرض عدد الأدلة على كل عنصر
 * بلا استعلامات إضافية.
 */
export function groupBySource(
  rows: readonly EvidenceLinkRow[],
  sourceType?: EvidenceSourceType,
): Map<string, EvidenceLinkRow[]> {
  const map = new Map<string, EvidenceLinkRow[]>();
  for (const r of rows) {
    if (sourceType && r.sourceType !== sourceType) continue;
    const arr = map.get(r.sourceId) ?? [];
    arr.push(r);
    map.set(r.sourceId, arr);
  }
  return map;
}

export function countBySource(
  rows: readonly EvidenceLinkRow[],
  sourceType?: EvidenceSourceType,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (sourceType && r.sourceType !== sourceType) continue;
    map.set(r.sourceId, (map.get(r.sourceId) ?? 0) + 1);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Coverage summary
// ---------------------------------------------------------------------------
export interface CoverageSummary {
  totalSources: number;       // إجمالي العناصر المستهدفة
  covered: number;            // عناصر عليها ≥ 1 دليل
  uncovered: number;
  coveragePercent: number;    // 0..100
  totalLinks: number;         // إجمالي الروابط
  avgLinksPerCovered: number; // متوسط عدد الأدلة على العنصر المُغطَّى
}

/**
 * نسبة العناصر المُغطَّاة (اللي عليها دليل واحد على الأقل) من إجمالي
 * العناصر المُمرَّرة. مفيد للـ Readiness gates والـ dashboards.
 */
export function summarizeCoverage(
  sourceIds: readonly string[],
  links: readonly EvidenceLinkRow[],
  sourceType?: EvidenceSourceType,
): CoverageSummary {
  const filtered = sourceType ? links.filter((l) => l.sourceType === sourceType) : links;
  const grouped = groupBySource(filtered);
  const covered = sourceIds.filter((id) => (grouped.get(id)?.length ?? 0) > 0).length;
  const total = sourceIds.length;
  const totalLinks = filtered.length;
  return {
    totalSources: total,
    covered,
    uncovered: total - covered,
    coveragePercent: total === 0 ? 0 : Math.round((covered / total) * 100),
    totalLinks,
    avgLinksPerCovered: covered === 0 ? 0 : Math.round((totalLinks / covered) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Evidence quality health
// ---------------------------------------------------------------------------
export interface EvidenceHealth {
  totalLinks: number;
  linksWithNote: number;
  noteRatio: number;   // 0..100 — نسبة الروابط التي فيها شرح لسبب الربط
  /**
   * لو ratio < 40% = ضعيف (روابط بلا سياق).
   * لو 40..70 = مقبول. لو > 70 = صحّي.
   */
  quality: "poor" | "acceptable" | "healthy";
}

const QUALITY_LOW = 40;
const QUALITY_HIGH = 70;

export function deriveEvidenceHealth(rows: readonly EvidenceLinkRow[]): EvidenceHealth {
  const withNote = rows.filter((r) => r.note.trim().length > 0).length;
  const ratio = rows.length === 0 ? 0 : Math.round((withNote / rows.length) * 100);
  const quality: EvidenceHealth["quality"] =
    ratio >= QUALITY_HIGH ? "healthy" : ratio >= QUALITY_LOW ? "acceptable" : "poor";
  return {
    totalLinks: rows.length,
    linksWithNote: withNote,
    noteRatio: ratio,
    quality,
  };
}
