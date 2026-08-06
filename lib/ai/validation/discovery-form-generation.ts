import type {
  DiscoveryConditionalOperator,
  DiscoveryDepth,
  DiscoveryQuestionType,
} from "@/lib/types/database";
import { ALLOWED_QUESTION_TYPES } from "@/lib/ai/prompts/discovery-form-generation";

const TYPE_SET = new Set<string>(ALLOWED_QUESTION_TYPES);
const OPTION_TYPES = new Set<DiscoveryQuestionType>(["multiple_choice", "checkbox", "multi_select"]);
const OPERATORS = new Set<DiscoveryConditionalOperator>(["equals", "not_equals", "includes", "exists", "not_exists"]);

/** حد أقصى صارم لعدد الأسئلة حسب العمق — أي زيادة تُقتطع (لا تُرفض). */
const DEPTH_CAP: Record<DiscoveryDepth, number> = {
  quick: 20,
  standard: 35,
  deep: 55,
  enterprise_audit: 80,
};

export interface ParsedConditional {
  dependsOnRef: string;
  operator: DiscoveryConditionalOperator;
  value?: unknown;
}

export interface ParsedGeneratedQuestion {
  ref: string;
  question: string;
  description: string | null;
  type: DiscoveryQuestionType;
  required: boolean;
  placeholder: string | null;
  options: string[];
  help_text: string | null;
  category: string;
  conditional: ParsedConditional | null;
}

export interface ParsedGeneratedForm {
  name: string;
  description: string;
  estimatedProjectSize: string | null;
  tags: string[];
  questions: ParsedGeneratedQuestion[];
}

export type DiscoveryFormValidationResult =
  | { ok: true; data: ParsedGeneratedForm }
  | { ok: false; reason: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
}

export function validateDiscoveryFormGeneration(
  raw: string | null,
  depth: DiscoveryDepth
): DiscoveryFormValidationResult {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };

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
  const tpl = (obj.template ?? {}) as Record<string, unknown>;
  const name = isNonEmptyString(tpl.name) ? tpl.name.trim() : "";
  const description = isNonEmptyString(tpl.description) ? tpl.description.trim() : "";

  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    return { ok: false, reason: "sections لازم يكون مصفوفة غير فارغة." };
  }

  const cap = DEPTH_CAP[depth];
  const questions: ParsedGeneratedQuestion[] = [];
  const seenRefs = new Set<string>();

  for (const rawSection of obj.sections) {
    if (typeof rawSection !== "object" || rawSection === null) continue;
    const section = rawSection as Record<string, unknown>;
    const category = isNonEmptyString(section.title) ? section.title.trim() : "عام";
    if (!Array.isArray(section.questions)) continue;

    for (const rawQ of section.questions) {
      if (questions.length >= cap) break;
      if (typeof rawQ !== "object" || rawQ === null) continue;
      const q = rawQ as Record<string, unknown>;

      if (!isNonEmptyString(q.question)) continue;
      if (typeof q.type !== "string" || !TYPE_SET.has(q.type)) continue;
      const type = q.type as DiscoveryQuestionType;

      const options = stringArray(q.options);
      // نوع يتطلّب خيارات بلا خيارات صالحة → أسقط السؤال (لا يُعرض صح)
      if (OPTION_TYPES.has(type) && options.length === 0) continue;

      // ref فريد — لو ناقص أو مكرر، ولّد واحدًا تلقائيًا
      let ref = isNonEmptyString(q.ref) ? q.ref.trim() : `q${questions.length + 1}`;
      if (seenRefs.has(ref)) ref = `${ref}_${questions.length + 1}`;
      seenRefs.add(ref);

      // منطق شرطي: يجب أن يشير لسؤال سابق موجود بالفعل (حارس الهلوسة)
      let conditional: ParsedConditional | null = null;
      const rawCond = q.conditional;
      if (typeof rawCond === "object" && rawCond !== null) {
        const c = rawCond as Record<string, unknown>;
        const dependsOnRef = isNonEmptyString(c.dependsOnRef) ? c.dependsOnRef.trim() : null;
        const operator = typeof c.operator === "string" && OPERATORS.has(c.operator as DiscoveryConditionalOperator)
          ? (c.operator as DiscoveryConditionalOperator)
          : null;
        // dependsOnRef لازم يكون ref سؤال سبق إضافته فعلًا — وإلا يُسقَط الشرط بهدوء
        if (dependsOnRef && operator && seenRefs.has(dependsOnRef) && dependsOnRef !== ref) {
          conditional = { dependsOnRef, operator };
          if (operator !== "exists" && operator !== "not_exists" && c.value !== undefined) {
            conditional.value = c.value;
          }
        }
      }

      questions.push({
        ref,
        question: q.question.trim(),
        description: isNonEmptyString(q.description) ? q.description.trim() : null,
        type,
        required: q.required === true,
        placeholder: isNonEmptyString(q.placeholder) ? q.placeholder.trim() : null,
        options,
        help_text: isNonEmptyString(q.help_text) ? q.help_text.trim() : null,
        category,
        conditional,
      });
    }
    if (questions.length >= cap) break;
  }

  if (questions.length === 0) {
    return { ok: false, reason: "لم يُنتَج أي سؤال صالح." };
  }

  return {
    ok: true,
    data: {
      name: name || "نموذج اكتشاف مُولَّد",
      description: description || "نموذج اكتشاف مخصص مُولَّد بالذكاء الاصطناعي.",
      estimatedProjectSize: isNonEmptyString(tpl.estimated_project_size) ? tpl.estimated_project_size.trim() : null,
      tags: stringArray(tpl.tags),
      questions,
    },
  };
}
