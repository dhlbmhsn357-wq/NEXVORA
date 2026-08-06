export interface MeetingFileAnalysisResult {
  summary: string;
  confidence: number;
  entities: string[];
}

export type MeetingFileAnalysisValidationResult =
  | { ok: true; data: MeetingFileAnalysisResult }
  | { ok: false; reason: string };

export function validateMeetingFileAnalysis(raw: string | null): MeetingFileAnalysisValidationResult {
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
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (summary.length === 0) {
    return { ok: false, reason: "summary مفقود أو فارغ." };
  }

  const rawConfidence = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(100, Math.round(rawConfidence))) : 50;

  const entities = Array.isArray(obj.entities)
    ? obj.entities.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    : [];

  return { ok: true, data: { summary, confidence, entities } };
}
