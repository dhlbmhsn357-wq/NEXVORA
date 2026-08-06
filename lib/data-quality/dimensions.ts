import type { DatasetProfile, FieldProfile } from "./profiling";

/**
 * أبعاد جودة البيانات — **وحدة نقية بلا I/O**.
 *
 * لكل حقل يحسب: الاكتمال، الصلاحية، التفرّد، الاتساق، ودرجة ثقة (Trust)،
 * ثم درجة جودة عامة للمجموعة /١٠٠.
 */

export interface FieldDimensions {
  field: string;
  completeness: number; // نسبة غير الفارغ
  validity: number; // نسبة الصالح
  uniqueness: number; // نسبة التمايز (للحقول التعريفية)
  consistency: number; // تجانس الطول/النمط
  trustScore: number; // مركّب
}

export interface DatasetQuality {
  fields: FieldDimensions[];
  completeness: number;
  validity: number;
  uniqueness: number;
  consistency: number;
  overall: number;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 100;
  return Math.round((part / whole) * 100);
}

/** هل الحقل تعريفي (يُتوقَّع تفرّده)؟ */
function isIdentityField(f: FieldProfile): boolean {
  return /(id|code|email|phone|sku|number|رقم|كود)/i.test(f.field);
}

export function fieldDimensions(f: FieldProfile): FieldDimensions {
  const nonNull = f.total - f.nulls;
  const completeness = pct(nonNull, f.total);
  const validity = nonNull > 0 ? pct(nonNull - f.invalid, nonNull) : 100;
  const uniqueness = nonNull > 0 ? pct(f.distinct, nonNull) : 100;

  // الاتساق: تجانس الطول (فرق كبير بين min/max يخفضه) + غياب القيم الشاذّة.
  const lengthSpread = f.maxLength > 0 ? f.minLength / f.maxLength : 1;
  let consistency = Math.round(lengthSpread * 100);
  if (f.numericStats && nonNull > 0) consistency = Math.min(consistency, pct(nonNull - f.numericStats.outliers, nonNull));
  consistency = Math.max(0, Math.min(100, consistency));

  // الثقة: مركّب مرجَّح. التفرّد يُوزَن فقط للحقول التعريفية.
  const trustScore = isIdentityField(f)
    ? Math.round(completeness * 0.3 + validity * 0.35 + uniqueness * 0.25 + consistency * 0.1)
    : Math.round(completeness * 0.4 + validity * 0.4 + consistency * 0.2);

  return { field: f.field, completeness, validity, uniqueness, consistency, trustScore };
}

export function assessQuality(profile: DatasetProfile): DatasetQuality {
  const fields = profile.fields.map(fieldDimensions);
  if (fields.length === 0) {
    return { fields: [], completeness: 0, validity: 0, uniqueness: 0, consistency: 0, overall: 0 };
  }
  const avg = (sel: (d: FieldDimensions) => number) => Math.round(fields.reduce((s, d) => s + sel(d), 0) / fields.length);
  const completeness = avg((d) => d.completeness);
  const validity = avg((d) => d.validity);
  const uniqueness = avg((d) => d.uniqueness);
  const consistency = avg((d) => d.consistency);
  const overall = Math.round(completeness * 0.3 + validity * 0.35 + consistency * 0.2 + avg((d) => d.trustScore) * 0.15);

  return { fields, completeness, validity, uniqueness, consistency, overall };
}
