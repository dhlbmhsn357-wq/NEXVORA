/**
 * التحقق من رد مهمة PROJECT_ASSISTANT_QA (Phase C) — نفس نمط
 * lib/ai/validation/prd-generation.ts: JSON صالح، مفاتيح مضبوطة، أنواع
 * صحيحة. زيادة عن ده: هنا **الضمانة الحقيقية** ضد الاختراع —
 * cited_source_ids بتتقصّ لمجموعة المعرّفات الفعلية اللي كانت متاحة
 * فعلًا وقت الاسترجاع، مش بس ثقة في النموذج.
 */

export const ANSWER_STATUS_VALUES = ["approved", "documented", "unresolved", "not_found"] as const;
export type AnswerStatus = (typeof ANSWER_STATUS_VALUES)[number];

export interface ProjectAssistantAnswerData {
  answerText: string;
  answerStatus: AnswerStatus;
  citedSourceIds: string[];
  conflictExplained: boolean;
}

export type ProjectAssistantAnswerValidationResult =
  | { ok: true; data: ProjectAssistantAnswerData; warnings: string[] }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAnswerStatus(value: unknown): value is AnswerStatus {
  return typeof value === "string" && (ANSWER_STATUS_VALUES as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * يتحقق من رد النموذج ويقصّ أي id مُستشهَد بيه غير موجود فعليًا في مجموعة
 * المصادر اللي اتبعتت للنموذج (الحالية + التاريخية). ده الدفاع الحقيقي
 * ضد الهلوسة — مش تعليمة Prompt بنأمل إن النموذج يلتزم بيها.
 *
 * `validSourceIds`: اتحاد id لكل الصفوف اللي فعلًا كانت في الـ prompt
 * (retrievedEntries + supersededContext) — أي id تاني بيتشال بصمت مع
 * تحذير في warnings، بلا ما نفشّل الـ pipeline كله لأجله.
 */
export function validateProjectAssistantAnswer(
  raw: string | null,
  validSourceIds: ReadonlySet<string>
): ProjectAssistantAnswerValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const obj = parsed as Record<string, unknown>;

  if (!isNonEmptyString(obj.answer_text)) {
    return { ok: false, reason: "answer_text مفقود أو فارغ." };
  }

  if (!isAnswerStatus(obj.answer_status)) {
    return {
      ok: false,
      reason: `answer_status غير صالحة: "${String(obj.answer_status)}" — لازم تكون واحدة من: ${ANSWER_STATUS_VALUES.join(", ")}.`,
    };
  }

  if (!isStringArray(obj.cited_source_ids)) {
    return { ok: false, reason: "cited_source_ids لازم تكون مصفوفة نصوص." };
  }

  if (typeof obj.conflict_explained !== "boolean") {
    return { ok: false, reason: "conflict_explained لازم تكون boolean." };
  }

  const warnings: string[] = [];

  // الدفاع الحقيقي ضد الهلوسة: نقص أي id مش موجود فعليًا في المصادر
  // اللي اتبعتت للنموذج — مش بس نثق في التزامه بالتعليمة.
  const rawCitedIds = obj.cited_source_ids as string[];
  const hallucinated = rawCitedIds.filter((id) => !validSourceIds.has(id));
  let citedSourceIds = rawCitedIds.filter((id) => validSourceIds.has(id));
  if (hallucinated.length > 0) {
    warnings.push(
      `تم حذف ${hallucinated.length} معرّف(ات) استشهاد غير موجودة فعليًا في المصادر المسترجَعة: ${hallucinated.join(", ")}`
    );
  }

  const answerStatus = obj.answer_status as AnswerStatus;

  // اتساق ذاتي: لو الحالة "غير موجود"، منطقيًا مفيش استشهادات — لو
  // النموذج ناقض نفسه، نصحّح بهدوء بدل ما نفشّل الـ pipeline كله.
  if (answerStatus === "not_found" && citedSourceIds.length > 0) {
    warnings.push(
      `answer_status="not_found" لكن النموذج رجّع ${citedSourceIds.length} استشهاد(ات) — تم تفريغها تلقائيًا لعدم الاتساق.`
    );
    citedSourceIds = [];
  }

  return {
    ok: true,
    data: {
      answerText: (obj.answer_text as string).trim(),
      answerStatus,
      citedSourceIds,
      conflictExplained: obj.conflict_explained as boolean,
    },
    warnings,
  };
}
