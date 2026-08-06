/**
 * مُتحقّق مخرَج تحليل الـSchema Mapping — نمط صارم موحّد.
 */

export interface MappingSuggestion {
  old_object: string;
  old_field: string;
  new_field: string | null;
  confidence: number;
  reason: string;
  transformation_hint: string;
}

export interface SchemaMappingData {
  suggestions: MappingSuggestion[];
  overall_note: string;
}

export type SchemaMappingValidation = { ok: true; data: SchemaMappingData } | { ok: false; reason: string };

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function validateSchemaMapping(raw: string | null): SchemaMappingValidation {
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
  const suggestions: MappingSuggestion[] = [];
  for (const item of rawList.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.old_object !== "string" || typeof s.old_field !== "string") continue;
    suggestions.push({
      old_object: s.old_object.trim(),
      old_field: s.old_field.trim(),
      new_field: typeof s.new_field === "string" && s.new_field.trim() ? s.new_field.trim() : null,
      confidence: clamp(s.confidence),
      reason: typeof s.reason === "string" ? s.reason.trim() : "",
      transformation_hint: typeof s.transformation_hint === "string" ? s.transformation_hint.trim() : "none",
    });
  }

  return {
    ok: true,
    data: { suggestions, overall_note: typeof obj.overall_note === "string" ? obj.overall_note.trim() : "" },
  };
}
