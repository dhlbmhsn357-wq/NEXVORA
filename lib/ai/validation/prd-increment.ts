import type { AcceptanceCriterion, UserStory } from "@/lib/types/database";
import { isNonEmptyString, isStringArray } from "./helpers";
import { extractJsonObject } from "@/lib/discovery-analysis/validation";

/**
 * مُحقّق قسم الـ PRD المخصّص لزيادة واحدة.
 *
 * القسم ده **إضافي**: بيوصف الجزء الجديد بس. عشان كده المصفوفات هنا
 * مسموح تكون فاضية (زيادة صغيرة ممكن ما يكون ليها متطلبات غير وظيفية
 * مثلًا)، لكن `summary` إجباري — قسم من غير ملخّص مالوش قيمة للـ PM.
 */

export interface PrdIncrementSectionData {
  summary: string;
  scope_added: string[];
  functional_requirements: string[];
  non_functional_requirements: string[];
  user_stories: UserStory[];
  acceptance_criteria: AcceptanceCriterion[];
  impact_on_existing: string[];
  risks_assumptions: string[];
  test_focus: string[];
}

export type PrdIncrementValidationResult =
  | { ok: true; data: PrdIncrementSectionData }
  | { ok: false; reason: string };

export const PRD_INCREMENT_KEYS = [
  "summary",
  "scope_added",
  "functional_requirements",
  "non_functional_requirements",
  "user_stories",
  "acceptance_criteria",
  "impact_on_existing",
  "risks_assumptions",
  "test_focus",
] as const;

const STRING_ARRAY_KEYS = [
  "scope_added",
  "functional_requirements",
  "non_functional_requirements",
  "impact_on_existing",
  "risks_assumptions",
  "test_focus",
] as const;

function isUserStoryArray(value: unknown): value is UserStory[] {
  return (
    Array.isArray(value) &&
    value.every((v) => {
      if (typeof v !== "object" || v === null) return false;
      const o = v as Record<string, unknown>;
      return isNonEmptyString(o.role) && isNonEmptyString(o.want) && isNonEmptyString(o.benefit);
    })
  );
}

function isAcceptanceCriteriaArray(value: unknown): value is AcceptanceCriterion[] {
  return (
    Array.isArray(value) &&
    value.every((v) => {
      if (typeof v !== "object" || v === null) return false;
      const o = v as Record<string, unknown>;
      return isNonEmptyString(o.given) && isNonEmptyString(o.when) && isNonEmptyString(o.then);
    })
  );
}

export function validatePrdIncrementSection(raw: string | null): PrdIncrementValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  // استخراج متسامح: النموذج بيلفّ الرد في code fences أو بيسبقه بكلام
  // كتير، والمُحلّل الصارم كان بيرفض ردود صحيحة تمامًا بسبب ده.
  const parsed = extractJsonObject(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON صالحًا." };
  }

  const obj = parsed as Record<string, unknown>;

  if (!isNonEmptyString(obj.summary)) {
    return { ok: false, reason: 'الحقل "summary" مفقود أو فارغ.' };
  }

  for (const key of STRING_ARRAY_KEYS) {
    // المفتاح الغائب بيتعامل كمصفوفة فاضية — الزيادة الصغيرة مش لازم
    // تملا كل الأقسام، والرفض هنا كان هيخلّي زيادات صحيحة تفشل بلا داعي.
    if (obj[key] === undefined || obj[key] === null) {
      obj[key] = [];
      continue;
    }
    if (!isStringArray(obj[key])) {
      return { ok: false, reason: `الحقل "${key}" لازم يكون مصفوفة نصوص.` };
    }
  }

  if (obj.user_stories === undefined || obj.user_stories === null) obj.user_stories = [];
  if (!isUserStoryArray(obj.user_stories)) {
    return {
      ok: false,
      reason: 'الحقل "user_stories" لازم يكون مصفوفة عناصر فيها role و want و benefit.',
    };
  }

  if (obj.acceptance_criteria === undefined || obj.acceptance_criteria === null) {
    obj.acceptance_criteria = [];
  }
  if (!isAcceptanceCriteriaArray(obj.acceptance_criteria)) {
    return {
      ok: false,
      reason: 'الحقل "acceptance_criteria" لازم يكون بصيغة given و when و then.',
    };
  }

  const data: PrdIncrementSectionData = {
    summary: obj.summary,
    scope_added: obj.scope_added as string[],
    functional_requirements: obj.functional_requirements as string[],
    non_functional_requirements: obj.non_functional_requirements as string[],
    user_stories: obj.user_stories,
    acceptance_criteria: obj.acceptance_criteria,
    impact_on_existing: obj.impact_on_existing as string[],
    risks_assumptions: obj.risks_assumptions as string[],
    test_focus: obj.test_focus as string[],
  };

  const hasContent =
    data.scope_added.length > 0 ||
    data.functional_requirements.length > 0 ||
    data.non_functional_requirements.length > 0 ||
    data.user_stories.length > 0 ||
    data.acceptance_criteria.length > 0;

  if (!hasContent) {
    return {
      ok: false,
      reason: "القسم بلا محتوى فعلي — لا نطاق ولا متطلبات ولا قصص مستخدم ولا معايير قبول.",
    };
  }

  return { ok: true, data };
}
