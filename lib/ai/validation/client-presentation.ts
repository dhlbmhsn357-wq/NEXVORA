import { CLIENT_PRESENTATION_SLIDE_KEYS } from "@/lib/types/database";
import type { ClientPresentationSlideKey, ClientPresentationSlides } from "@/lib/types/database";

const EXPECTED_KEYS = CLIENT_PRESENTATION_SLIDE_KEYS;

export type ClientPresentationValidationResult =
  | { ok: true; data: ClientPresentationSlides }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

function isObjectArray(
  value: unknown,
  requiredKeys: string[]
): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const o = item as Record<string, unknown>;
    return requiredKeys.every((k) => isNonEmptyString(o[k]));
  });
}

function validateSlide(key: string, value: unknown): string | null {
  if (typeof value !== "object" || value === null) return `"${key}" ليس كائن.`;
  const o = value as Record<string, unknown>;

  switch (key) {
    case "cover":
      if (!isNonEmptyString(o.title) || !isNonEmptyString(o.subtitle) || !isNonEmptyString(o.client_name)) {
        return `"cover" يحتاج title/subtitle/client_name كنصوص غير فارغة.`;
      }
      return null;
    case "agenda":
      if (!isStringArray(o.items)) return `"agenda" يحتاج items مصفوفة نصوص.`;
      return null;
    case "executive_summary":
      if (!isNonEmptyString(o.title) || !isNonEmptyString(o.body) || !isStringArray(o.highlights)) {
        return `"executive_summary" يحتاج title/body نصوص، وhighlights مصفوفة نصوص.`;
      }
      return null;
    case "business_problem":
    case "solution":
    case "closing":
    case "about_company":
    case "vision":
      if (!isNonEmptyString(o.title) || !isNonEmptyString(o.body)) {
        return `"${key}" يحتاج title/body كنصوص غير فارغة.`;
      }
      return null;
    case "current_situation":
    case "our_understanding":
    case "transformation":
      if (!isNonEmptyString(o.title) || !isNonEmptyString(o.body) || !isStringArray(o.points)) {
        return `"${key}" يحتاج title/body نصوص، وpoints مصفوفة نصوص.`;
      }
      return null;
    case "modules":
    case "workflow":
    case "departments":
    case "user_roles":
    case "reports":
    case "ai_capabilities":
      if (!isNonEmptyString(o.title) || !isStringArray(o.items)) {
        return `"${key}" يحتاج title نص وitems مصفوفة نصوص.`;
      }
      return null;
    case "before_after":
      if (!isNonEmptyString(o.title) || !isObjectArray(o.pairs, ["before", "after"])) {
        return `"before_after" يحتاج title نص وpairs مصفوفة كائنات {before, after}.`;
      }
      return null;
    case "roi":
      if (!isNonEmptyString(o.title) || !isObjectArray(o.metrics, ["name", "value", "description"])) {
        return `"roi" يحتاج title نص وmetrics مصفوفة كائنات {name, value, description}.`;
      }
      return null;
    case "pain_points":
      if (!isNonEmptyString(o.title) || !isStringArray(o.items)) {
        return `"pain_points" يحتاج title نص وitems مصفوفة نصوص.`;
      }
      return null;
    case "scope":
      if (!isStringArray(o.in_scope) || !isStringArray(o.out_of_scope)) {
        return `"scope" يحتاج in_scope وout_of_scope كمصفوفتي نصوص.`;
      }
      return null;
    case "features":
      if (!isNonEmptyString(o.title) || !isStringArray(o.features)) {
        return `"features" يحتاج title نص وfeatures مصفوفة نصوص.`;
      }
      return null;
    case "timeline":
      if (!isNonEmptyString(o.title) || !isObjectArray(o.phases, ["name", "duration", "description"])) {
        return `"timeline" يحتاج title نص وphases مصفوفة كائنات {name, duration, description}.`;
      }
      return null;
    case "architecture":
      if (!isNonEmptyString(o.title) || !isNonEmptyString(o.description) || !isStringArray(o.components)) {
        return `"architecture" يحتاج title/description نصوص، وcomponents مصفوفة نصوص.`;
      }
      return null;
    case "risks":
      if (!isNonEmptyString(o.title) || !isObjectArray(o.items, ["risk", "mitigation"])) {
        return `"risks" يحتاج title نص وitems مصفوفة كائنات {risk, mitigation}.`;
      }
      return null;
    case "roadmap":
      if (!isNonEmptyString(o.title) || !isObjectArray(o.milestones, ["name", "target_date", "description"])) {
        return `"roadmap" يحتاج title نص وmilestones مصفوفة كائنات {name, target_date, description}.`;
      }
      return null;
    case "kpis":
      if (!isNonEmptyString(o.title) || !isObjectArray(o.metrics, ["name", "value", "description"])) {
        return `"kpis" يحتاج title نص وmetrics مصفوفة كائنات {name, value, description}.`;
      }
      return null;
    case "next_steps":
      if (!isNonEmptyString(o.title) || !isStringArray(o.items)) {
        return `"next_steps" يحتاج title نص وitems مصفوفة نصوص.`;
      }
      return null;
    case "qa":
      if (!isNonEmptyString(o.title) || !isStringArray(o.items)) {
        return `"qa" يحتاج title نص وitems مصفوفة نصوص.`;
      }
      return null;
    default:
      return `مفتاح غير معروف: ${key}`;
  }
}

/**
 * يتحقق من رد التوليد قبل أي حفظ: JSON صالح، 17 مفتاحًا بالضبط بنفس
 * الأسماء المطلوبة، وكل شريحة بالشكل الصحيح لنوعها.
 */
export function validateClientPresentation(raw: string | null): ClientPresentationValidationResult {
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
  const actualKeys = Object.keys(obj);

  const missingKeys = EXPECTED_KEYS.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `شرائح ناقصة: ${missingKeys.join(", ")}` };
  }

  const extraKeys = actualKeys.filter((k) => !(EXPECTED_KEYS as readonly string[]).includes(k));
  if (extraKeys.length > 0) {
    return { ok: false, reason: `شرائح إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }

  for (const key of EXPECTED_KEYS) {
    const error = validateSlide(key, obj[key]);
    if (error) return { ok: false, reason: error };
  }

  return { ok: true, data: obj as unknown as ClientPresentationSlides };
}

export type ClientPresentationSlideValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * يتحقق من رد إعادة توليد شريحة واحدة: JSON صالح، مفتاح واحد بالظبط
 * (نفس اسم الشريحة المطلوبة)، وشكل القيمة صحيح لنوعها.
 */
export function validateClientPresentationSlide(
  raw: string | null,
  slideKey: ClientPresentationSlideKey
): ClientPresentationSlideValidationResult {
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
  const actualKeys = Object.keys(obj);

  if (actualKeys.length !== 1 || actualKeys[0] !== slideKey) {
    return { ok: false, reason: `المتوقع مفتاح واحد بس باسم "${slideKey}".` };
  }

  const error = validateSlide(slideKey, obj[slideKey]);
  if (error) return { ok: false, reason: error };

  return { ok: true, value: obj[slideKey] };
}
