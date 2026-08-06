import type { ArchitectureGaps } from "@/lib/types/database";
import type { DeterministicArchitectureAnalysis } from "@/lib/domain-intelligence/module-catalog";

/**
 * برومبت التحقّق المعماري (pure). الجزء الحتمي (وحدات/ميزات ناقصة) بيتحسب
 * في module-catalog؛ الـ AI هنا بيكمّل الفئات اللي محتاجة حكم دلالي:
 * الأدوار/التكاملات/الـ Workflows/اللوحات/الإشعارات/قواعد العمل/سجلات
 * التدقيق/الأمان/الـ APIs/جداول قاعدة البيانات — كلها قبل توليد الـ PRD.
 */

const GAP_KEYS: (keyof ArchitectureGaps)[] = [
  "reports", "permissions", "roles", "integrations", "workflows", "dashboards",
  "notifications", "business_rules", "audit_logs", "security", "apis", "db_tables",
];

export function buildArchitectureValidationPrompt(params: {
  domain: string;
  brainSummary: string;
  deterministic: DeterministicArchitectureAnalysis;
}): string {
  const { domain, brainSummary, deterministic } = params;
  const present = deterministic.presentModules.map((m) => m.name).join("، ") || "لا يوجد";
  const missingModules = deterministic.missingModules.map((m) => m.name).join("، ") || "لا يوجد";
  const missingFeatures = deterministic.missingFeatures.map((f) => `${f.module_key}:${f.feature}`).join("، ") || "لا يوجد";

  return `أنت مهندس حلول مؤسسي (Enterprise Solution Architect). راجع تصميم المشروع قبل توليد الـ PRD واكتشف النواقص المعمارية.

مجال المشروع: ${domain}
الوحدات الموجودة: ${present}
وحدات ناقصة (تحليل حتمي): ${missingModules}
ميزات فرعية ناقصة (تحليل حتمي): ${missingFeatures}

ملخّص الـ Brain المعتمد:
${brainSummary.slice(0, 6000)}

اكتشف العناصر الناقصة التي **لم** يذكرها التحليل الحتمي، لكل فئة. لا تكرّر ما هو مذكور أعلاه.
أعد **JSON فقط** بالشكل ده (كل قيمة مصفوفة نصوص عربية موجزة، فارغة لو لا يوجد نقص):
{
${GAP_KEYS.map((k) => `  "${k}": []`).join(",\n")},
  "executive_summary": "ملخص تنفيذي موجز (2-3 جمل) عن الجاهزية المعمارية والمخاطر الأهم"
}
قواعد: استنتج من مجال المشروع والـ Brain فقط، لا تخترع تكاملات غير منطقية. اكتب بالعربي. لا شيء خارج الـ JSON.`;
}

export function parseArchitectureValidation(output: string | null): { gaps: Partial<ArchitectureGaps>; summary: string } {
  const empty = { gaps: {}, summary: "" };
  if (!output) return empty;
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const p = JSON.parse(match[0]) as Record<string, unknown>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map(String).slice(0, 20) : []);
    const gaps: Partial<ArchitectureGaps> = {};
    for (const k of GAP_KEYS) {
      const list = arr(p[k]);
      if (list.length) gaps[k] = list;
    }
    return { gaps, summary: typeof p.executive_summary === "string" ? p.executive_summary : "" };
  } catch {
    return empty;
  }
}

export { GAP_KEYS };
