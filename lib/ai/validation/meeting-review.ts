export interface MeetingReviewSynthesis {
  discussed: string[];
  not_discussed: string[];
  open_questions: string[];
  new_assumptions: string[];
}

export type MeetingReviewValidationResult = { ok: true; data: MeetingReviewSynthesis } | { ok: false; reason: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function validateMeetingReviewSynthesis(raw: string | null): MeetingReviewValidationResult {
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

  const o = parsed as Record<string, unknown>;
  if (!isStringArray(o.discussed) || !isStringArray(o.not_discussed) || !isStringArray(o.open_questions) || !isStringArray(o.new_assumptions)) {
    return { ok: false, reason: "المتوقع discussed/not_discussed/open_questions/new_assumptions كمصفوفات نصوص." };
  }

  return {
    ok: true,
    data: {
      discussed: o.discussed,
      not_discussed: o.not_discussed,
      open_questions: o.open_questions,
      new_assumptions: o.new_assumptions,
    },
  };
}
