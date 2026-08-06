export interface ExecutionTaskPlanItem {
  title: string;
  description: string;
  target_file_hints: string[];
}

export type ExecutionPlanValidationResult =
  | { ok: true; data: ExecutionTaskPlanItem[] }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** يتحقق من رد تخطيط التنفيذ: JSON صالح، tasks مصفوفة غير فاضية، وكل مهمة بالشكل الصحيح. */
export function validateExecutionPlan(raw: string | null): ExecutionPlanValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "الرد ليس كائن JSON." };
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) {
    return { ok: false, reason: "المتوقع مصفوفة tasks غير فاضية." };
  }

  const tasks: ExecutionTaskPlanItem[] = [];
  for (const [i, raw] of obj.tasks.entries()) {
    if (typeof raw !== "object" || raw === null) return { ok: false, reason: `المهمة رقم ${i + 1} ليست كائن.` };
    const t = raw as Record<string, unknown>;
    if (!isNonEmptyString(t.title) || !isNonEmptyString(t.description) || !isStringArray(t.target_file_hints)) {
      return { ok: false, reason: `المهمة رقم ${i + 1} تحتاج title/description كنصوص، target_file_hints مصفوفة نصوص.` };
    }
    tasks.push({ title: t.title, description: t.description, target_file_hints: t.target_file_hints });
  }

  return { ok: true, data: tasks };
}

export interface FixPromptResult {
  fix_prompt: string;
  target_file_hints: string[];
}

export type FixPromptValidationResult = { ok: true; data: FixPromptResult } | { ok: false; reason: string };

/** يتحقق من رد توليد Fix Prompt: JSON صالح بحقلي fix_prompt وtarget_file_hints. */
export function validateFixPrompt(raw: string | null): FixPromptValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "الرد ليس كائن JSON." };
  const obj = parsed as Record<string, unknown>;
  if (!isNonEmptyString(obj.fix_prompt) || !isStringArray(obj.target_file_hints)) {
    return { ok: false, reason: "المتوقع fix_prompt نص غير فارغ، target_file_hints مصفوفة نصوص." };
  }

  return { ok: true, data: { fix_prompt: obj.fix_prompt, target_file_hints: obj.target_file_hints } };
}
