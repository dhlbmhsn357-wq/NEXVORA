/**
 * مُتحقّق مخرَج تحليل مصدر الترحيل — نمط صارم (نفس نمط بقية المُتحقّقات):
 * تفريغ فارغ → JSON.parse محروس → فحص المفاتيح المتوقّعة تمامًا → فحص كل
 * حقل → إرجاع بيانات مُنمَّطة.
 */

export interface MigrationSourceAnalysisData {
  system_type: string;
  key_modules: string[];
  risk_narrative: string;
  human_review_items: string[];
  migration_readiness_note: string;
}

export type MigrationSourceAnalysisValidation =
  | { ok: true; data: MigrationSourceAnalysisData }
  | { ok: false; reason: string };

const EXPECTED_KEYS = ["system_type", "key_modules", "risk_narrative", "human_review_items", "migration_readiness_note"] as const;

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
}

function strArray(v: unknown, max = 30): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, max);
}

export function validateMigrationSourceAnalysis(raw: string | null): MigrationSourceAnalysisValidation {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "مخرَج فارغ." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "JSON غير صالح." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "المخرَج ليس كائنًا." };
  }

  const obj = parsed as Record<string, unknown>;
  for (const k of EXPECTED_KEYS) {
    if (!(k in obj)) return { ok: false, reason: `مفتاح مفقود: ${k}` };
  }

  const system_type = typeof obj.system_type === "string" ? obj.system_type.trim() : "";
  const risk_narrative = typeof obj.risk_narrative === "string" ? obj.risk_narrative.trim() : "";
  const migration_readiness_note = typeof obj.migration_readiness_note === "string" ? obj.migration_readiness_note.trim() : "";
  if (!system_type) return { ok: false, reason: "system_type فارغ." };

  return {
    ok: true,
    data: {
      system_type,
      key_modules: strArray(obj.key_modules),
      risk_narrative,
      human_review_items: strArray(obj.human_review_items),
      migration_readiness_note,
    },
  };
}
