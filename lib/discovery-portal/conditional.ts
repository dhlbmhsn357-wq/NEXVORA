import type { DiscoveryQuestion, DiscoveryQuestionConditional } from "@/lib/types/database";

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** مقارنة قيمة إجابة مع قيمة الشرط — تتعامل مع النص/الرقم/البوليان/المصفوفة. */
function looseEquals(answer: unknown, target: unknown): boolean {
  if (Array.isArray(answer)) return answer.some((a) => looseEquals(a, target));
  if (typeof answer === "boolean" || typeof target === "boolean") {
    const norm = (v: unknown) => (v === true || v === "true" || v === "نعم" ? true : v === false || v === "false" || v === "لا" ? false : v);
    return norm(answer) === norm(target);
  }
  return String(answer).trim() === String(target).trim();
}

/**
 * يقيّم شرط إظهار واحد على مجموعة الإجابات الحالية. dependsOn = id
 * السؤال المُعتمَد عليه. الحارس: لو السؤال المُعتمَد عليه غير موجود في
 * القائمة، نُظهر السؤال (fail-open) عشان ما نخفيش سؤالًا بالغلط.
 */
export function evaluateCondition(
  conditional: DiscoveryQuestionConditional,
  answers: Record<string, unknown>,
  knownQuestionIds: Set<string>
): boolean {
  if (!knownQuestionIds.has(conditional.dependsOn)) return true;
  const answer = answers[conditional.dependsOn];

  switch (conditional.operator) {
    case "exists":
      return !isEmpty(answer);
    case "not_exists":
      return isEmpty(answer);
    case "equals":
      return !isEmpty(answer) && looseEquals(answer, conditional.value);
    case "not_equals":
      return isEmpty(answer) || !looseEquals(answer, conditional.value);
    case "includes":
      if (Array.isArray(answer)) return answer.some((a) => looseEquals(a, conditional.value));
      return !isEmpty(answer) && looseEquals(answer, conditional.value);
    default:
      return true;
  }
}

/** هل يظهر السؤال بناءً على منطقه الشرطي؟ null = يظهر دائمًا. */
export function isQuestionVisible(
  question: DiscoveryQuestion,
  answers: Record<string, unknown>,
  knownQuestionIds: Set<string>
): boolean {
  if (!question.conditional) return true;
  return evaluateCondition(question.conditional, answers, knownQuestionIds);
}

/**
 * يرشّح قائمة الأسئلة إلى المرئية فقط حسب الإجابات الحالية — مع الحفاظ
 * على الترتيب. يُستخدم في الـ Wizard وحساب التقدّم والتحقق النهائي.
 */
export function visibleQuestions(
  questions: DiscoveryQuestion[],
  answers: Record<string, unknown>
): DiscoveryQuestion[] {
  const ids = new Set(questions.map((q) => q.id));
  return questions.filter((q) => isQuestionVisible(q, answers, ids));
}
