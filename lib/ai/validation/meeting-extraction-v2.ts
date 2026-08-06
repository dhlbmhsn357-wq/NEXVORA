import { MEETING_EXTRACTION_V2_CATEGORIES } from "@/lib/types/database";
import type { ExtractedItemV2, MeetingExtractionV2 } from "@/lib/types/database";

export type MeetingExtractionV2ValidationResult =
  | { ok: true; data: MeetingExtractionV2 }
  | { ok: false; reason: string };

/**
 * نفس فلسفة validation/meeting-extraction.ts القديمة (مرنة، مفتاح
 * غايب = فاضي، عناصر غير صالحة تتجاهل بدل رفض الرد كله) لكن لكل عنصر
 * شكل {text, confidence_score, evidence_quote, speaker_guess} بدل
 * string خام.
 */
function toCleanItem(raw: unknown): ExtractedItemV2 | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (text.length === 0) return null;

  const rawScore = typeof obj.confidence_score === "number" ? obj.confidence_score : Number(obj.confidence_score);
  const confidence_score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 50;

  const evidence_quote = typeof obj.evidence_quote === "string" && obj.evidence_quote.trim().length > 0 ? obj.evidence_quote.trim() : null;
  const speaker_guess = typeof obj.speaker_guess === "string" && obj.speaker_guess.trim().length > 0 ? obj.speaker_guess.trim() : null;

  return { text, confidence_score, evidence_quote, speaker_guess };
}

function toCleanItemArray(value: unknown): ExtractedItemV2[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(toCleanItem).filter((v): v is ExtractedItemV2 => v !== null);
}

export function validateMeetingExtractionV2(raw: string | null): MeetingExtractionV2ValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

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
  const result = {} as MeetingExtractionV2;

  for (const category of MEETING_EXTRACTION_V2_CATEGORIES) {
    if (obj[category] === undefined || obj[category] === null) {
      result[category] = [];
      continue;
    }
    const clean = toCleanItemArray(obj[category]);
    if (clean === null) {
      return { ok: false, reason: `${category} يجب أن تكون مصفوفة.` };
    }
    result[category] = clean;
  }

  const rawOverall = typeof obj.overall_confidence === "number" ? obj.overall_confidence : Number(obj.overall_confidence);
  result.overall_confidence = Number.isFinite(rawOverall) ? Math.max(0, Math.min(100, Math.round(rawOverall))) : 50;

  return { ok: true, data: result };
}
