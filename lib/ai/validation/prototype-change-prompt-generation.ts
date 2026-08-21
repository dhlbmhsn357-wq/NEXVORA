/**
 * التحقق من رد مهمة PROTOTYPE_CHANGE_PROMPT_GENERATION (المرحلة ج).
 *
 * المخرج المتوقَّع نص نثري (Prompt جاهز للصق)، مش بيانات مهيكلة زي
 * standard-change-impact-analysis.ts — فمفيش "IDs حقيقية" نتحقق منها هنا؛
 * الضمانة الحقيقية ضد الاختراع اتحصّلت فعلًا في مرحلة سابقة (بناء الـ
 * prompt نفسه مبني حصريًا على change_impacts بحالة 'applied' — راجع
 * prototype-prompt-service.ts). التحقق هنا خفيف عمدًا: شكل JSON صالح
 * بمفتاح واحد، ونص غير فارغ بطول معقول (لا فارغ تمامًا، ولا قصير جدًا
 * لدرجة إنه مش Prompt عملي فعلي، ولا طويل بشكل غير معقول يوحي بخروج عن
 * السياق).
 */

export type PrototypeChangePromptValidationResult =
  | { ok: true; promptText: string }
  | { ok: false; reason: string };

const MIN_LENGTH = 40;
const MAX_LENGTH = 20_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePrototypeChangePromptGeneration(
  raw: string | null
): PrototypeChangePromptValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const promptText = parsed.prompt_text;
  if (typeof promptText !== "string" || promptText.trim().length === 0) {
    return { ok: false, reason: "prompt_text مفقود أو فارغ." };
  }

  const trimmed = promptText.trim();
  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, reason: `prompt_text قصير جدًا (${trimmed.length} حرف) — غير كافٍ ليكون Prompt عملي فعلي.` };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: `prompt_text طويل بشكل غير معقول (${trimmed.length} حرف) — يوحي بخروج عن نطاق التغيير المطلوب.` };
  }

  return { ok: true, promptText: trimmed };
}
