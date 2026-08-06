import type { PromptRule } from "./types";

/**
 * Prompt Rules Engine — مصدر واحد لقواعد الجودة الموحّدة. كل Profile
 * بيختار المفاتيح المناسبة، والـ assemble بيحقنها. ممنوع تكرار نص القواعد
 * دي في أي مولّد برومبت — يستدعوها من هنا.
 */
const RULES: Record<string, PromptRule> = {
  architecture: {
    key: "architecture",
    text: "افهم معمارية النظام الحالية والتزم بها — لا تقترح بنية موازية أو نمطًا مختلفًا عن المتّبع في المشروع.",
  },
  scope_lock: {
    key: "scope_lock",
    text: "التزم بنطاق المهمة المحدد فقط. لا تخترع متطلبات أو Features غير مذكورة، ولا تحذف أي متطلب موجود.",
  },
  no_break: {
    key: "no_break",
    text: "ممنوع كسر أي جزء شغّال في النظام. لا تعدّل أجزاء خارج نطاق المهمة.",
  },
  reuse_components: {
    key: "reuse_components",
    text: "أعد استخدام المكوّنات والدوال والأنماط الموجودة بدل إنشاء بدائل مكرّرة.",
  },
  ai_provider_only: {
    key: "ai_provider_only",
    text: "أي استدعاء للذكاء الاصطناعي لازم يمرّ عبر AI Provider Layer (AIService.execute) فقط — ممنوع استدعاء مزوّد مباشرة.",
  },
  design_system: {
    key: "design_system",
    text: "احترم الـ Design System (متغيّرات var(--v-*)، مكوّنات الـ UI المشتركة) — لا تخترع ألوانًا أو أنماطًا خارجه.",
  },
  database_respect: {
    key: "database_respect",
    text: "احترم قاعدة البيانات الحالية وقيودها — أي تعديل Schema لازم يكون additive وآمنًا وبـ migration مستقلة.",
  },
  rbac: {
    key: "rbac",
    text: "احترم صلاحيات المستخدمين (RBAC) وسياسات RLS — لا تتجاوز طبقة التحقق من الصلاحية.",
  },
  versioning: {
    key: "versioning",
    text: "احترم منطق الإصدارات (Versioning) — لا تستبدل نسخة سابقة بصمت، وسجّل مصدر كل مخرَج.",
  },
  no_hallucination: {
    key: "no_hallucination",
    text: "لا تخترع أي معلومة غير موجودة في السياق المتاح. لو المعلومة ناقصة، صرّح بذلك بدل التخمين.",
  },
  evidence: {
    key: "evidence",
    text: "اربط كل استنتاج بدليل من السياق المصدر — عنصر بلا مصدر واضح يُعتبر تخمينًا مرفوضًا.",
  },
};

/** يرجّع نصوص القواعد المطلوبة بالترتيب (مع تجاهل أي مفتاح غير معروف). */
export function getRules(ruleKeys: string[]): PromptRule[] {
  return ruleKeys.map((k) => RULES[k]).filter((r): r is PromptRule => !!r);
}

/** يبني كتلة القواعد الجاهزة للحقن في البرومبت. */
export function buildRulesBlock(ruleKeys: string[]): string {
  const rules = getRules(ruleKeys);
  if (rules.length === 0) return "";
  const lines = rules.map((r, i) => `${i + 1}. ${r.text}`);
  return `## قواعد الجودة الإلزامية (أي مخالفة = نتيجة مرفوضة)\n${lines.join("\n")}`;
}

/** كل المفاتيح المتاحة — للاختبار/التوثيق. */
export function allRuleKeys(): string[] {
  return Object.keys(RULES);
}
