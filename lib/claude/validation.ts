export type FileChangeAction = "create" | "update" | "delete";

export interface ClaudeFileChange {
  path: string;
  action: FileChangeAction;
  content: string | null;
}

export interface ClaudeTaskResult {
  summary: string;
  files: ClaudeFileChange[];
}

export type ClaudeTaskValidationResult = { ok: true; data: ClaudeTaskResult } | { ok: false; reason: string };

const ACTIONS: FileChangeAction[] = ["create", "update", "delete"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * يتحقق من رد Claude لتنفيذ مهمة: JSON صالح، summary نص، files مصفوفة
 * تغييرات صحيحة الشكل (path + action صحيح، content مطلوب إلا لو action=delete).
 */
export function validateClaudeTaskResult(raw: string | null): ClaudeTaskValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "رد Claude فارغ." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "رد Claude ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "رد Claude ليس كائن JSON." };
  const obj = parsed as Record<string, unknown>;

  if (!isNonEmptyString(obj.summary)) return { ok: false, reason: "المتوقع summary نص غير فارغ." };
  if (!Array.isArray(obj.files) || obj.files.length === 0) {
    return { ok: false, reason: "المتوقع مصفوفة files غير فاضية (لازم Claude يعدّل ملف واحد على الأقل)." };
  }

  const files: ClaudeFileChange[] = [];
  for (const [i, raw] of obj.files.entries()) {
    if (typeof raw !== "object" || raw === null) return { ok: false, reason: `الملف رقم ${i + 1} ليس كائن.` };
    const f = raw as Record<string, unknown>;
    if (!isNonEmptyString(f.path)) return { ok: false, reason: `الملف رقم ${i + 1} محتاج path نص غير فارغ.` };
    if (typeof f.action !== "string" || !ACTIONS.includes(f.action as FileChangeAction)) {
      return { ok: false, reason: `الملف رقم ${i + 1} محتاج action من (create|update|delete).` };
    }
    const action = f.action as FileChangeAction;
    if (action !== "delete" && !isNonEmptyString(f.content)) {
      return { ok: false, reason: `الملف رقم ${i + 1} (${action}) محتاج content غير فارغ.` };
    }
    files.push({ path: f.path, action, content: action === "delete" ? null : (f.content as string) });
  }

  return { ok: true, data: { summary: obj.summary, files } };
}
