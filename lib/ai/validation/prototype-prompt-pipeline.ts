import type { PrototypePromptPlanModule, PrototypePromptPlanSize } from "@/lib/types/database";

export type PlanValidationResult =
  | { ok: true; data: { project_size: PrototypePromptPlanSize; execution_summary: string; modules: PrototypePromptPlanModule[] } }
  | { ok: false; reason: string };

const SIZE_RANGES: Record<PrototypePromptPlanSize, { min: number; max: number }> = {
  small: { min: 6, max: 8 },
  medium: { min: 10, max: 12 },
  enterprise: { min: 16, max: 20 },
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * يتحقق من رد مرحلة التخطيط: JSON صالح، project_size من القيم
 * المسموحة، عدد الموديولات مطابق لنطاق الحجم المختار، index متسلسل
 * بدون فجوات من 1، وdepends_on بيشير بس لـ index أصغر (سلسلة صحيحة
 * بدون اعتماديات دائرية أو للأمام).
 */
export function validateExecutionPlan(raw: string | null): PlanValidationResult {
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

  const size = obj.project_size;
  if (size !== "small" && size !== "medium" && size !== "enterprise") {
    return { ok: false, reason: `project_size غير صالح: ${String(size)}` };
  }

  if (!isNonEmptyString(obj.execution_summary)) {
    return { ok: false, reason: "execution_summary فارغ أو غير موجود." };
  }

  if (!Array.isArray(obj.modules) || obj.modules.length === 0) {
    return { ok: false, reason: "modules لازم يكون مصفوفة غير فارغة." };
  }

  const range = SIZE_RANGES[size];
  if (obj.modules.length < range.min || obj.modules.length > range.max) {
    return {
      ok: false,
      reason: `عدد الموديولات (${obj.modules.length}) خارج النطاق المتوقع لحجم "${size}" (${range.min}-${range.max}).`,
    };
  }

  const modules: PrototypePromptPlanModule[] = [];
  for (let i = 0; i < obj.modules.length; i++) {
    const raw_m = obj.modules[i];
    if (typeof raw_m !== "object" || raw_m === null) {
      return { ok: false, reason: `الموديول رقم ${i + 1} ليس كائنًا صالحًا.` };
    }
    const m = raw_m as Record<string, unknown>;
    const expectedIndex = i + 1;
    if (m.index !== expectedIndex) {
      return { ok: false, reason: `ترتيب index خاطئ عند الموقع ${i + 1} (المتوقع ${expectedIndex}, الموجود ${String(m.index)}).` };
    }
    if (!isNonEmptyString(m.title) || !isNonEmptyString(m.summary)) {
      return { ok: false, reason: `الموديول رقم ${expectedIndex} يحتاج title وsummary كنصوص غير فارغة.` };
    }
    if (!Array.isArray(m.depends_on) || !m.depends_on.every((d) => typeof d === "number")) {
      return { ok: false, reason: `الموديول رقم ${expectedIndex}: depends_on لازم يكون مصفوفة أرقام.` };
    }
    const invalidDep = m.depends_on.find((d) => d >= expectedIndex || d < 1);
    if (invalidDep !== undefined) {
      return {
        ok: false,
        reason: `الموديول رقم ${expectedIndex}: depends_on يحتوي مرجع غير صالح (${invalidDep}) — لازم يشير لموديول سابق بس.`,
      };
    }
    modules.push({
      index: expectedIndex,
      title: m.title as string,
      summary: m.summary as string,
      depends_on: m.depends_on as number[],
    });
  }

  return {
    ok: true,
    data: { project_size: size, execution_summary: obj.execution_summary as string, modules },
  };
}

export type StageValidationResult = { ok: true; content: string } | { ok: false; reason: string };

const MIN_STAGE_CONTENT_LENGTH = 200;

/**
 * تحقق خفيف من محتوى Stage — بدون فرض شكل JSON صارم (المحتوى نص
 * Markdown حر بلا حد أقصى للطول حسب الطلب)، بس نتأكد إنه مش فاضي أو
 * قصير بشكل واضح إنه رد فاشل/مقطوع.
 */
export function validateStageContent(raw: string | null): StageValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }
  const trimmed = raw.trim();
  if (trimmed.length < MIN_STAGE_CONTENT_LENGTH) {
    return { ok: false, reason: "الرد قصير جدًا بشكل يوحي بفشل أو انقطاع التوليد." };
  }
  return { ok: true, content: trimmed };
}
