import type { MonitoringFixPromptArea, MonitoringFixPromptContent, MonitoringPriorityLevel } from "@/lib/types/database";

const AREAS: MonitoringFixPromptArea[] = ["database", "frontend", "api", "worker", "tests", "deployment", "other"];
const PRIORITIES: MonitoringPriorityLevel[] = ["critical", "high", "medium", "low"];
const MAX_PROMPTS = 6;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

export interface ParsedFixPrompt {
  area: MonitoringFixPromptArea;
  content: MonitoringFixPromptContent;
}

export type ProductionFixPromptValidationResult = { ok: true; data: ParsedFixPrompt[] } | { ok: false; reason: string };

function validateOne(raw: unknown, index: number): { ok: true; value: ParsedFixPrompt } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: `Prompt رقم ${index + 1} ليس كائنًا.` };
  const p = raw as Record<string, unknown>;

  if (typeof p.area !== "string" || !AREAS.includes(p.area as MonitoringFixPromptArea)) {
    return { ok: false, reason: `Prompt رقم ${index + 1}: area غير صالح.` };
  }
  if (!isNonEmptyString(p.title)) return { ok: false, reason: `Prompt رقم ${index + 1}: title مفقود.` };
  if (!isNonEmptyString(p.problem)) return { ok: false, reason: `Prompt رقم ${index + 1}: problem مفقود.` };

  const priority = typeof p.priority === "string" && PRIORITIES.includes(p.priority as MonitoringPriorityLevel) ? (p.priority as MonitoringPriorityLevel) : "medium";

  return {
    ok: true,
    value: {
      area: p.area as MonitoringFixPromptArea,
      content: {
        title: p.title as string,
        context: isNonEmptyString(p.context) ? p.context : "",
        problem: p.problem as string,
        evidence: isNonEmptyString(p.evidence) ? p.evidence : "",
        expected_result: isNonEmptyString(p.expected_result) ? p.expected_result : "",
        acceptance_criteria: stringArray(p.acceptance_criteria),
        files: stringArray(p.files),
        dependencies: stringArray(p.dependencies),
        priority,
        risks: isNonEmptyString(p.risks) ? p.risks : "",
        testing_plan: isNonEmptyString(p.testing_plan) ? p.testing_plan : "",
        rollback: isNonEmptyString(p.rollback) ? p.rollback : "",
      },
    },
  };
}

export function validateProductionFixPromptGeneration(raw: string | null): ProductionFixPromptValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.prompts) || obj.prompts.length === 0) return { ok: false, reason: "prompts لازم يكون مصفوفة غير فاضية." };

  const prompts: ParsedFixPrompt[] = [];
  for (let i = 0; i < Math.min(obj.prompts.length, MAX_PROMPTS); i++) {
    const result = validateOne(obj.prompts[i], i);
    if (!result.ok) return { ok: false, reason: result.reason };
    prompts.push(result.value);
  }

  return { ok: true, data: prompts };
}
