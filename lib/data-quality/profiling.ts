import type { Dataset } from "./dataset";
import { inferValueKind, validateValue, type ValueKind } from "./validators";

/**
 * تحليل البيانات (Data Profiling) — **وحدة نقية بلا I/O**.
 *
 * يحسب لكل حقل: القيم الفارغة، المتمايزة، التكرار، الأنماط، القيم الشاذّة،
 * ونسبة القيم غير الصالحة. أساس مقاييس الجودة وكشف المشاكل.
 */

export interface FieldProfile {
  field: string;
  kind: ValueKind;
  total: number;
  nulls: number;
  distinct: number;
  duplicates: number;
  invalid: number;
  minLength: number;
  maxLength: number;
  /** أشهر ٣ قيم (للعرض والكشف). */
  topValues: Array<{ value: string; count: number }>;
  numericStats: { min: number; max: number; mean: number; outliers: number } | null;
}

export interface DatasetProfile {
  name: string;
  records: number;
  fields: FieldProfile[];
  totalNulls: number;
  totalInvalid: number;
}

export function profileDataset(ds: Dataset): DatasetProfile {
  const fields: FieldProfile[] = ds.fields.map((f) => profileField(ds, f));
  return {
    name: ds.name,
    records: ds.rows.length,
    fields,
    totalNulls: fields.reduce((s, f) => s + f.nulls, 0),
    totalInvalid: fields.reduce((s, f) => s + f.invalid, 0),
  };
}

function profileField(ds: Dataset, field: string): FieldProfile {
  const kind = inferValueKind(field);
  const counts = new Map<string, number>();
  let nulls = 0;
  let invalid = 0;
  let minLength = Infinity;
  let maxLength = 0;
  const numeric: number[] = [];

  for (const row of ds.rows) {
    const raw = (row[field] ?? "").trim();
    if (raw === "") {
      nulls++;
      continue;
    }
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    minLength = Math.min(minLength, raw.length);
    maxLength = Math.max(maxLength, raw.length);

    if (!validateValue(kind, raw).valid) invalid++;

    if (kind === "number" || kind === "currency" || kind === "percentage") {
      const n = parseFloat(raw.replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(n)) numeric.push(n);
    }
  }

  const distinct = counts.size;
  const nonNull = ds.rows.length - nulls;
  const duplicates = nonNull - distinct;
  const topValues = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value, count]) => ({ value, count }));

  return {
    field,
    kind,
    total: ds.rows.length,
    nulls,
    distinct,
    duplicates: duplicates > 0 ? duplicates : 0,
    invalid,
    minLength: Number.isFinite(minLength) ? minLength : 0,
    maxLength,
    topValues,
    numericStats: numeric.length > 0 ? computeNumericStats(numeric) : null,
  };
}

function computeNumericStats(nums: number[]): { min: number; max: number; mean: number; outliers: number } {
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  const sd = Math.sqrt(variance);
  // شاذّ = يبعد أكثر من ٣ انحرافات معيارية.
  const outliers = sd > 0 ? nums.filter((n) => Math.abs(n - mean) > 3 * sd).length : 0;
  return { min, max, mean: Math.round(mean * 100) / 100, outliers };
}
