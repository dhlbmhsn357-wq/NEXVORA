/**
 * مُتحقّق مخرَج تحليل جودة البيانات — نمط صارم موحّد.
 */

export interface DataQualitySuggestion {
  object: string;
  field: string;
  row_index: number;
  corrected_value: string | null;
  confidence: number;
  reason: string;
}

export interface DataQualityData {
  suggestions: DataQualitySuggestion[];
  overall_note: string;
}

export type DataQualityValidation = { ok: true; data: DataQualityData } | { ok: false; reason: string };

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function validateDataQuality(raw: string | null): DataQualityValidation {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "مخرَج فارغ." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "JSON غير صالح." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "المخرَج ليس كائنًا." };
  const obj = parsed as Record<string, unknown>;
  if (!("suggestions" in obj) || !("overall_note" in obj)) return { ok: false, reason: "مفاتيح ناقصة." };

  const rawList = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const suggestions: DataQualitySuggestion[] = [];
  for (const item of rawList.slice(0, 2000)) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.object !== "string" || typeof s.field !== "string") continue;
    const rowIndex = typeof s.row_index === "number" ? Math.max(0, Math.floor(s.row_index)) : 0;
    suggestions.push({
      object: s.object.trim(),
      field: s.field.trim(),
      row_index: rowIndex,
      corrected_value: typeof s.corrected_value === "string" && s.corrected_value.trim() ? s.corrected_value.trim() : null,
      confidence: clamp(s.confidence),
      reason: typeof s.reason === "string" ? s.reason.trim() : "",
    });
  }

  return { ok: true, data: { suggestions, overall_note: typeof obj.overall_note === "string" ? obj.overall_note.trim() : "" } };
}
