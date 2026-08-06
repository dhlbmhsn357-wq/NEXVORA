/**
 * نموذج الخبرة المؤسسية — **وحدة نقية بلا I/O**.
 *
 * ده العقد للطبقة الثالثة من المعرفة. بيعرّف أنواع الخبرة، تصنيف المجال،
 * وحساب الثقة والأثر — كلها منطق أعمال يعيش في الكود لا في القاعدة.
 */

export const EXPERIENCE_TYPES = [
  "success_pattern",
  "failure_pattern",
  "anti_pattern",
  "lesson_learned",
  "reusable_workflow",
  "reusable_module",
  "reusable_business_rule",
  "reusable_architecture",
  "reusable_checklist",
  "reusable_prompt",
  "reusable_sop",
  "reusable_api",
  "reusable_db_model",
  "best_practice",
] as const;

export type ExperienceType = (typeof EXPERIENCE_TYPES)[number];

export const EXPERIENCE_TYPE_LABELS: Record<ExperienceType, string> = {
  success_pattern: "نمط نجاح",
  failure_pattern: "نمط فشل",
  anti_pattern: "نمط مضادّ",
  lesson_learned: "درس مستفاد",
  reusable_workflow: "سير عمل قابل لإعادة الاستخدام",
  reusable_module: "وحدة قابلة لإعادة الاستخدام",
  reusable_business_rule: "قاعدة عمل قابلة لإعادة الاستخدام",
  reusable_architecture: "معمار قابل لإعادة الاستخدام",
  reusable_checklist: "قائمة تحقّق قابلة لإعادة الاستخدام",
  reusable_prompt: "برومبت قابل لإعادة الاستخدام",
  reusable_sop: "إجراء تشغيلي قابل لإعادة الاستخدام",
  reusable_api: "نمط API قابل لإعادة الاستخدام",
  reusable_db_model: "نموذج قاعدة بيانات قابل لإعادة الاستخدام",
  best_practice: "أفضل ممارسة",
};

export function experienceTypeLabel(type: string): string {
  return EXPERIENCE_TYPE_LABELS[type as ExperienceType] ?? type;
}

export function isReusable(type: string): boolean {
  return type.startsWith("reusable_");
}

export function isExperienceType(value: unknown): value is ExperienceType {
  return typeof value === "string" && (EXPERIENCE_TYPES as readonly string[]).includes(value);
}

// ============================================================
// حساب الثقة والأثر
// ============================================================

export interface ExperienceSignals {
  /** كم مشروعًا ساهم في/استفاد من الخبرة. */
  projectCount: number;
  /** جودة المحتوى ٠–١٠٠ (طول، اكتمال). */
  quality: number;
  /** هل مرّت بمراجعة بشرية؟ (مقبولة). */
  humanApproved: boolean;
}

/**
 * يحسب ثقة الخبرة.
 *
 * الثقة تنمو مع عدد المشاريع المُثبِتة: خبرة من مشروع واحد مبدئية، ومن
 * ثلاثين مشروعًا شبه مؤكَّدة. المراجعة البشرية ترفع أرضية الثقة —
 * الموافقة إشارة قوية.
 */
export function computeConfidence(signals: ExperienceSignals): number {
  // أساس التشبّع بعدد المشاريع: عند ٣٠ مشروعًا يقترب من السقف.
  const projectFactor = 1 - Math.exp(-signals.projectCount / 12);
  const base = 40 + projectFactor * 50; // ٤٠ عند صفر، ~٩٠ عند ٣٠
  const qualityBonus = (clamp(signals.quality) / 100) * 10;
  const approvalFloor = signals.humanApproved ? 55 : 0;
  return clamp(Math.max(approvalFloor, Math.round(base * 0.85 + qualityBonus)));
}

/**
 * يقترح تعديل الثقة مع الاستخدام المتراكم (التحسين المستمر).
 *
 * استُخدمت في ٣٠ مشروعًا وأثبتت نجاحها → زيادة. ثبت عدم نجاحها →
 * اقتراح التقاعد.
 */
export function usageAdjustment(usageCount: number, currentConfidence: number): {
  nextConfidence: number;
  suggestRetire: boolean;
} {
  // كل استخدام ناجح يرفع قليلًا، بسقف ٩٥.
  const bump = Math.min(95, currentConfidence + Math.floor(usageCount / 5));
  // ثقة منخفضة جدًا بعد استخدام كافٍ = مرشّحة للتقاعد.
  const suggestRetire = usageCount >= 10 && currentConfidence < 30;
  return { nextConfidence: clamp(bump), suggestRetire };
}

/**
 * يصنّف مجال الخبرة.
 *
 * لو الخبرة جاءت من مشاريع بمجالات مختلفة = عابرة للمجالات. من مجال
 * واحد = مجاله. بلا مجال واضح = عامة.
 */
export function classifyDomain(sourceDomains: string[]): string {
  const distinct = [...new Set(sourceDomains.map((d) => d.trim().toLowerCase()).filter((d) => d && d !== "generic"))];
  if (distinct.length === 0) return "general";
  if (distinct.length === 1) return distinct[0];
  return "cross_domain";
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
