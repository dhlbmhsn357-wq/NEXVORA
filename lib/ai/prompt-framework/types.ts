/**
 * Unified Prompt Framework — الأنواع المشتركة. أي مرحلة بتولّد Prompt
 * بتستخدم نفس هذه الأنواع بدل ما تخترع شكلها الخاص.
 */

/** الجهة اللي البرومبت موجّه ليها — بيحدد هل نحقن Workflow خاص بـ Claude Code. */
export type PromptTarget = "gemini" | "claude_code";

/** الملفات الشخصية القابلة لإعادة الاستخدام — كل واحد بيضيف القواعد المناسبة. */
export type PromptProfileId =
  | "analysis"
  | "discovery"
  | "prd"
  | "code_generation"
  | "code_review"
  | "engineering_qa"
  | "documentation"
  | "production";

/** قاعدة جودة موحّدة تُحقَن في البرومبت (مفتاح ثابت + نص القاعدة). */
export interface PromptRule {
  key: string;
  text: string;
}

/** كتلة سياق مُسمّاة تُضاف للبرومبت (عنوان + محتوى جاهز). */
export interface PromptContextBlock {
  title: string;
  content: string;
}

/** مصدر بُني عليه البرومبت — للتتبّع والـ Versioning. */
export interface PromptSource {
  type: string; // مثلًا: brain, prd, discovery, recommendations, incident
  ref?: string | null; // معرّف الصف المصدر لو موجود
  version?: number | null; // إصدار المصدر لو مُصدّر
}

/** تعريف Profile: القواعد + الهدف الافتراضي + متطلبات السياق للجاهزية. */
export interface PromptProfile {
  id: PromptProfileId;
  label: string;
  defaultTarget: PromptTarget;
  /** مفاتيح القواعد المُطبّقة من rules-engine. */
  ruleKeys: string[];
  /**
   * متطلبات الجاهزية — كل عنصر بيتحقّق من وجود كتلة سياق أساسية.
   * غيابها بيخصم من Prompt Readiness Score بالوزن المحدد.
   */
  readinessRequirements: PromptReadinessRequirement[];
}

export interface PromptReadinessRequirement {
  key: string;
  label: string;
  weight: number; // مجموع الأوزان لكل Profile ≤ 100
}

/** مُدخلات التركيب. */
export interface AssemblePromptInput {
  profile: PromptProfile;
  /** نص المرحلة الخاص (الـ Schema المطلوب + تعليمات المرحلة). */
  stageBody: string;
  /** كتل السياق (من Context Engine أو مبنية يدويًا). */
  context: PromptContextBlock[];
  /** override للهدف الافتراضي للـ Profile لو لزم. */
  target?: PromptTarget;
  /** جملة تعريف الدور (Persona) — اختيارية، لو غابت نستخدم الافتراضي للـ Profile. */
  persona?: string;
}

/** ميتاداتا البرومبت المُركّب. */
export interface AssembledPromptMetadata {
  profile: PromptProfileId;
  target: PromptTarget;
  ruleKeys: string[];
  claudeCodeWorkflowInjected: boolean;
  contextBlockTitles: string[];
}

export interface AssembledPrompt {
  text: string;
  metadata: AssembledPromptMetadata;
}

/** نتيجة حساب جاهزية البرومبت. */
export interface PromptReadinessDeduction {
  key: string;
  label: string;
  points: number; // النقاط المخصومة
  reason: string;
}

export interface PromptReadinessResult {
  score: number; // 0..100
  deductions: PromptReadinessDeduction[];
}
