import { hashTemplate } from "../cache/keys";

/**
 * باني البرومبت الموحّد — وحدة نقية.
 *
 * كل مراحل المشروع تمرّ من هنا، ولا يُكتب أي برومبت مباشرة في موضع
 * الاستخدام.
 *
 * **ملاحظة على النطاق:** المرحلة دي بتبني الآلية فقط. نصوص البرومبت
 * القائمة في `lib/ai/prompts/` **لم تُمَس** — نقلها لهذه الآلية مرحلة
 * تالية، والمواصفة منعت تغيير منطق البرومبت صراحةً.
 */

export interface PromptVariable {
  name: string;
  required: boolean;
  description?: string;
}

export interface PromptTemplate {
  key: string;
  taskType: string;
  version: number;
  template: string;
  variables: PromptVariable[];
  contentHash: string;
}

export interface BuiltPrompt {
  text: string;
  templateKey: string;
  version: number;
  contentHash: string;
  /** المتغيّرات المستخدَمة فعليًا — تُسجَّل مع النتيجة للتتبّع. */
  usedVariables: string[];
}

export class MissingVariableError extends Error {
  constructor(
    readonly templateKey: string,
    readonly missing: string[]
  ) {
    super(`متغيّرات مطلوبة ناقصة في «${templateKey}»: ${missing.join(", ")}`);
    this.name = "MissingVariableError";
  }
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** يستخرج أسماء المتغيّرات من نص القالب. */
export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found].sort();
}

/**
 * ينشئ تعريف قالب مع بصمته.
 *
 * البصمة تُحسب هنا لا عند الحفظ: القالب وبصمته يجب أن يولدا معًا، وإلا
 * أمكن حفظ بصمة لا تطابق محتواها.
 */
export function defineTemplate(input: {
  key: string;
  taskType: string;
  version: number;
  template: string;
  variables?: PromptVariable[];
}): PromptTemplate {
  const placeholders = extractPlaceholders(input.template);

  // المتغيّرات المُعلَنة اختيارية؛ الافتراضي أن كل ما في النص مطلوب.
  const variables =
    input.variables ?? placeholders.map((name) => ({ name, required: true }));

  return {
    key: input.key,
    taskType: input.taskType,
    version: input.version,
    template: input.template,
    variables,
    contentHash: hashTemplate(input.template),
  };
}

/**
 * يبني البرومبت النهائي.
 *
 * **المتغيّر المطلوب الناقص يرمي، ولا يُستبدَل بفراغ.** برومبت فيه
 * `{{projectName}}` فاضية يعطي نتيجة تبدو سليمة وهي مبنية على سياق
 * ناقص — وهذا فشل صامت يستحيل تتبّعه لاحقًا.
 */
export function buildPrompt(
  template: PromptTemplate,
  values: Record<string, unknown>
): BuiltPrompt {
  const missing = template.variables
    .filter((v) => v.required)
    .map((v) => v.name)
    .filter((name) => {
      const value = values[name];
      return value === undefined || value === null || value === "";
    });

  if (missing.length > 0) throw new MissingVariableError(template.key, missing);

  const used: string[] = [];
  const text = template.template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name];
    if (value === undefined || value === null) return "";
    used.push(name);
    return typeof value === "string" ? value : JSON.stringify(value);
  });

  return {
    text,
    templateKey: template.key,
    version: template.version,
    contentHash: template.contentHash,
    usedVariables: [...new Set(used)].sort(),
  };
}

/**
 * هل يستدعي التغيير إصدارًا جديدًا؟
 *
 * أي اختلاف في البصمة = نعم. التعديل «البسيط» على البرومبت يغيّر
 * المخرَج فعليًا، وإبقاء نفس الإصدار يخلط نتائج تعليمات مختلفة تحت رقم
 * واحد ويُبقي ذاكرةً لم تعد صالحة.
 */
export function needsNewVersion(current: PromptTemplate, nextTemplate: string): boolean {
  return current.contentHash !== hashTemplate(nextTemplate);
}

/** يبني الإصدار التالي من قالب قائم. */
export function nextVersion(current: PromptTemplate, nextTemplate: string): PromptTemplate {
  return defineTemplate({
    key: current.key,
    taskType: current.taskType,
    version: current.version + 1,
    template: nextTemplate,
  });
}

/**
 * يختار الإصدار المطلوب من التاريخ — أساس الرجوع لإصدار سابق.
 *
 * `null` عند عدم وجوده: الرجوع الصامت لأحدث إصدار عند طلب إصدار مفقود
 * يخفي خطأ الاستدعاء ويشغّل تعليمات غير المقصودة.
 */
export function selectVersion(
  history: PromptTemplate[],
  key: string,
  version?: number
): PromptTemplate | null {
  const forKey = history.filter((t) => t.key === key);
  if (forKey.length === 0) return null;

  if (version === undefined) {
    return forKey.reduce((latest, t) => (t.version > latest.version ? t : latest));
  }
  return forKey.find((t) => t.version === version) ?? null;
}
