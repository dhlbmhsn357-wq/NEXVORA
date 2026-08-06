/**
 * مُتحقّق مخرَج توليد قواعد التحويل — نمط صارم موحّد.
 */

export interface GeneratedRule {
  target_field: string;
  source_fields: string[];
  kind: string;
  config: Record<string, unknown>;
  confidence: number;
  reason: string;
}

export interface TransformationRulesData {
  rules: GeneratedRule[];
  overall_note: string;
}

export type TransformationRulesValidation = { ok: true; data: TransformationRulesData } | { ok: false; reason: string };

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function validateTransformationRules(raw: string | null, allowedKinds: Set<string>): TransformationRulesValidation {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "مخرَج فارغ." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "JSON غير صالح." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "المخرَج ليس كائنًا." };
  const obj = parsed as Record<string, unknown>;
  if (!("rules" in obj) || !("overall_note" in obj)) return { ok: false, reason: "مفاتيح ناقصة." };

  const rawList = Array.isArray(obj.rules) ? obj.rules : [];
  const rules: GeneratedRule[] = [];
  for (const item of rawList.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.target_field !== "string" || typeof r.kind !== "string") continue;
    if (!allowedKinds.has(r.kind)) continue; // لا يخترع أنواعًا
    rules.push({
      target_field: r.target_field.trim(),
      source_fields: Array.isArray(r.source_fields) ? (r.source_fields as unknown[]).filter((x): x is string => typeof x === "string") : [r.target_field.trim()],
      kind: r.kind,
      config: r.config && typeof r.config === "object" ? (r.config as Record<string, unknown>) : {},
      confidence: clamp(r.confidence),
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
    });
  }

  return { ok: true, data: { rules, overall_note: typeof obj.overall_note === "string" ? obj.overall_note.trim() : "" } };
}
