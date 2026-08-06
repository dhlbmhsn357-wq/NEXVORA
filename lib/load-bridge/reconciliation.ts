import type { LoadRow, ReconciliationResult, ReconciliationEntity, DatasetSummary, PackageManifest, LoadFormat } from "./load-types";

/**
 * المطابقة وبناء البيان — **نقيّة بلا I/O**.
 *
 * المطابقة هي شبكة الأمان الأخيرة: هل عدد الصفوف المُحمَّلة يطابق ما
 * توقّعه التنفيذ لكل كيان؟ أي فرق = تنبيه، لا يمرّ بصمت.
 */

/** تجزئة حتمية FNV-1a (32-bit) — بصمة محتوى بلا اعتماد تشفير. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** يطابق المتوقَّع (من التنفيذ) مع المُحمَّل (فعليًّا) لكل كيان. */
export function reconcile(
  expected: Record<string, number>,
  loaded: Record<string, number>
): ReconciliationResult {
  const entityKeys = [...new Set([...Object.keys(expected), ...Object.keys(loaded)])].sort();
  const entities: ReconciliationEntity[] = [];
  const mismatches: string[] = [];
  let totalExpected = 0;
  let totalLoaded = 0;

  for (const entity of entityKeys) {
    const exp = expected[entity] ?? 0;
    const got = loaded[entity] ?? 0;
    const match = exp === got;
    totalExpected += exp;
    totalLoaded += got;
    entities.push({ entity, expected: exp, loaded: got, match });
    if (!match) mismatches.push(`${entity}: متوقَّع ${exp} · مُحمَّل ${got} (فرق ${got - exp})`);
  }

  return {
    entities,
    totalExpected,
    totalLoaded,
    mismatches,
    reconciled: mismatches.length === 0 && totalExpected === totalLoaded,
  };
}

/** يبني بيان الحزمة من ملخّصات الكيانات. */
export function buildManifest(format: LoadFormat, entities: DatasetSummary[]): PackageManifest {
  const totalRows = entities.reduce((s, e) => s + e.rowCount, 0);
  return {
    format,
    totalEntities: entities.length,
    totalRows,
    entities,
    note: "مخرجات تحويل مُتحقَّق منها وجاهزة للاستيراد. البنية في supabase/migrations. رتّب الاستيراد بترتيب التبعية (الأب قبل الابن).",
  };
}

/** يشتقّ خريطة عدّ الصفوف لكل كيان من مصفوفة صفوف مُجمّعة. */
export function countByEntity(byEntity: Record<string, LoadRow[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [entity, rows] of Object.entries(byEntity)) out[entity] = rows.length;
  return out;
}
