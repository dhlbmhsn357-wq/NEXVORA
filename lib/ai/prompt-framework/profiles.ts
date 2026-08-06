import type { PromptProfile, PromptProfileId } from "./types";

/**
 * Prompt Profiles — ملفات شخصية قابلة لإعادة الاستخدام. كل مرحلة بتختار
 * Profile بدل ما تعرّف قواعدها بنفسها. الـ readinessRequirements بتحدد
 * كتل السياق الأساسية اللي غيابها بيخصم من Prompt Readiness Score.
 */
const PROFILES: Record<PromptProfileId, PromptProfile> = {
  analysis: {
    id: "analysis",
    label: "تحليل",
    defaultTarget: "gemini",
    ruleKeys: ["no_hallucination", "evidence", "scope_lock"],
    readinessRequirements: [
      { key: "primary_source", label: "بيانات المصدر الأساسية", weight: 60 },
      { key: "project_context", label: "سياق المشروع", weight: 40 },
    ],
  },
  discovery: {
    id: "discovery",
    label: "اكتشاف",
    defaultTarget: "gemini",
    ruleKeys: ["no_hallucination", "scope_lock"],
    readinessRequirements: [
      { key: "business_description", label: "وصف نشاط العميل", weight: 60 },
      { key: "domain_context", label: "سياق المجال", weight: 40 },
    ],
  },
  prd: {
    id: "prd",
    label: "PRD",
    defaultTarget: "gemini",
    ruleKeys: ["no_hallucination", "evidence", "scope_lock", "versioning"],
    readinessRequirements: [
      { key: "brain", label: "Project Brain معتمد", weight: 55 },
      { key: "recommendations", label: "توصيات مقبولة", weight: 20 },
      { key: "project_context", label: "سياق المشروع", weight: 25 },
    ],
  },
  code_generation: {
    id: "code_generation",
    label: "توليد كود",
    defaultTarget: "claude_code",
    ruleKeys: ["architecture", "scope_lock", "no_break", "reuse_components", "design_system", "database_respect", "rbac", "versioning"],
    readinessRequirements: [
      { key: "prd", label: "PRD", weight: 40 },
      { key: "brain", label: "Project Brain", weight: 25 },
      { key: "acceptance_criteria", label: "معايير القبول", weight: 20 },
      { key: "constraints", label: "قيود واضحة", weight: 15 },
    ],
  },
  code_review: {
    id: "code_review",
    label: "مراجعة كود",
    defaultTarget: "gemini",
    ruleKeys: ["architecture", "no_hallucination", "evidence", "scope_lock"],
    readinessRequirements: [
      { key: "code_context", label: "سياق الكود/الملفات", weight: 60 },
      { key: "requirements", label: "المتطلبات المرجعية", weight: 40 },
    ],
  },
  engineering_qa: {
    id: "engineering_qa",
    label: "Engineering QA",
    defaultTarget: "claude_code",
    ruleKeys: ["architecture", "scope_lock", "no_break", "reuse_components", "database_respect", "rbac", "no_hallucination"],
    readinessRequirements: [
      { key: "findings", label: "نتائج المراجعة", weight: 45 },
      { key: "prd", label: "PRD مرجعي", weight: 20 },
      { key: "acceptance_criteria", label: "معايير القبول", weight: 20 },
      { key: "constraints", label: "قيود واضحة", weight: 15 },
    ],
  },
  documentation: {
    id: "documentation",
    label: "توثيق",
    defaultTarget: "gemini",
    ruleKeys: ["no_hallucination", "evidence", "scope_lock"],
    readinessRequirements: [
      { key: "source_material", label: "المادة المصدر", weight: 70 },
      { key: "project_context", label: "سياق المشروع", weight: 30 },
    ],
  },
  production: {
    id: "production",
    label: "إنتاج",
    defaultTarget: "claude_code",
    ruleKeys: ["architecture", "scope_lock", "no_break", "database_respect", "rbac", "no_hallucination", "evidence"],
    readinessRequirements: [
      { key: "incident", label: "بيانات الحادثة", weight: 50 },
      { key: "evidence", label: "أدلة/لوجات", weight: 30 },
      { key: "constraints", label: "قيود/مخاطر", weight: 20 },
    ],
  },
};

const DEFAULT_PERSONAS: Record<PromptProfileId, string> = {
  analysis: "أنت محلّل أعمال محترف داخل VELORA — دقيق، مبني على الأدلة، لست مولّد نصوص.",
  discovery: "أنت فريق استشاري (Senior PM + Business Analyst + Solution Architect) داخل VELORA.",
  prd: "أنت Product Manager محترف داخل VELORA تكتب PRD دقيقًا مبنيًا على معرفة معتمدة.",
  code_generation: "أنت مهندس برمجيات خبير تكتب برومبت تنفيذ دقيقًا لمطوّر/Claude Code.",
  code_review: "أنت مراجع كود خبير — تجد المشاكل الحقيقية بدليل، بلا مجاملة.",
  engineering_qa: "أنت مهندس جودة (Engineering QA) خبير داخل VELORA.",
  documentation: "أنت كاتب توثيق تقني دقيق داخل VELORA.",
  production: "أنت مهندس موثوقية إنتاج (SRE) داخل VELORA — سلامة الإنتاج أولوية.",
};

export function getProfile(id: PromptProfileId): PromptProfile {
  return PROFILES[id];
}

export function getDefaultPersona(id: PromptProfileId): string {
  return DEFAULT_PERSONAS[id];
}

export function allProfileIds(): PromptProfileId[] {
  return Object.keys(PROFILES) as PromptProfileId[];
}
