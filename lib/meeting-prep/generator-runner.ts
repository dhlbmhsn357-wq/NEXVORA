import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import type { MeetingPrepContext } from "./context";
import type { MeetingPrepSectionKey, SectionMeta } from "./types";

const PERSONA = `أنت مساعد PM محترف داخل PM Operating System — مسؤوليتك تجهيز مدير المشروع (PM) لاجتماع الاكتشاف الأول مع العميل.

قواعد صارمة:
- اعتمد فقط على البيانات المذكورة تحت (إجابات الاكتشاف، ملاحظات PM، Project Brain، تحليل AI). لا تخترع أي معلومة عن العميل غير موجودة.
- لو معلومة غير مؤكّدة أو ناقصة، اذكر ده صراحة بدل الافتراض.
- أرجع JSON فقط، بدون Markdown، بدون code fences، بدون أي نص قبله أو بعده.
- كل قيمة نصية بالعربية، عملية ومباشرة، موجّهة لمدير مشروع بيقرأها قبل اجتماع حقيقي.`;

const STRICT_JSON_RULES = `
## قواعد الرد
- أرجع كائن JSON واحد فقط مطابق للـ Schema المطلوب بالضبط.
- لازم يحتوي حقل "confidence": { "score": رقم 0-100, "reason": نص أو null }.
- لو الثقة أقل من 70، اشرح السبب في reason. لو 70 فأكثر، reason=null.
- لا تضف أي حقول غير مذكورة في الـ Schema.`;

export interface SectionGenerationSuccess<T> {
  ok: true;
  content: T;
  meta: SectionMeta;
}
export interface SectionGenerationFailure {
  ok: false;
  message: string;
  code: string;
}
export type SectionGenerationResult<T> = SectionGenerationSuccess<T> | SectionGenerationFailure;

export interface ContentValidationResult<T> {
  ok: boolean;
  data?: T;
  reason?: string;
}

/**
 * المشغّل المشترك لكل مولّدات أقسام Meeting Preparation. كل قسم من الـ13
 * له ملفه الخاص (schema + validator منفصلين) وبيستدعي الدالة دي — الاستقلالية
 * الحقيقية في إمكانية استدعاء/إعادة توليد أي قسم بمفرده، مش في تكرار
 * كود AIService plumbing.
 */
export async function generateSection<T>(params: {
  sectionKey: MeetingPrepSectionKey;
  ctx: MeetingPrepContext;
  schemaInstructions: string; // وصف المهمة + الـ Schema الخاص بالقسم
  validateContent: (parsed: Record<string, unknown>) => ContentValidationResult<T>;
  actorId?: string | null;
}): Promise<SectionGenerationResult<T>> {
  const prompt = `${PERSONA}

${params.ctx.formattedSourceBlock}

## المطلوب منك بالضبط
${params.schemaInstructions}
${STRICT_JSON_RULES}`;

  const response = await AIService.execute(AITaskType.MEETING_PREPARATION, prompt, {
    actorId: params.actorId ?? undefined,
    projectId: params.ctx.projectId,
  });

  if (!response.success) {
    return {
      ok: false,
      message: response.error?.message ?? "فشل غير معروف.",
      code: response.error?.code ?? "UNKNOWN",
    };
  }

  let text = (response.output ?? "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "الرد ليس JSON صالحًا.", code: "INVALID_RESPONSE" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "الرد ليس كائن JSON.", code: "INVALID_RESPONSE" };
  }

  const obj = parsed as Record<string, unknown>;
  const confidenceRaw = obj.confidence;
  let score = 60;
  let reason: string | null = null;
  if (typeof confidenceRaw === "object" && confidenceRaw !== null) {
    const c = confidenceRaw as Record<string, unknown>;
    const rawScore = typeof c.score === "string" ? Number(c.score) : c.score;
    if (typeof rawScore === "number" && Number.isFinite(rawScore)) {
      score = Math.max(0, Math.min(100, Math.round(rawScore)));
    }
    reason = typeof c.reason === "string" ? c.reason : null;
  }

  const validated = params.validateContent(obj);
  if (!validated.ok || validated.data === undefined) {
    return {
      ok: false,
      message: `الرد لم يجتز الفحص: ${validated.reason ?? "شكل غير متوقع."}`,
      code: "INVALID_RESPONSE",
    };
  }

  return {
    ok: true,
    content: validated.data,
    meta: {
      status: "generated",
      confidence: score,
      confidence_reason: reason,
      last_updated: new Date().toISOString(),
    },
  };
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim().length > 0);
}
export function toCleanStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
