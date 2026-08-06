import { createHash } from "node:crypto";

/**
 * اشتقاق مفاتيح الذاكرة — وحدة نقية.
 *
 * ## القاعدة الحاكمة
 *
 * **مفتاح الذاكرة يحمل إصدار المنطق الذي أنتج النتيجة، لا المدخل وحده.**
 *
 * ذاكرة تُخدَم بعد تغيّر البرومبت أو النموذج أسوأ من عدم وجود ذاكرة:
 * النتيجة تبدو صحيحة وهي مبنية على تعليمات لم تعد قائمة، والخطأ صامت
 * ولا يُعزى إلى سببه. لذلك المفتاح يضمّ أربعة عناصر لا واحدًا.
 */

export interface CacheKeyInput {
  taskType: string;
  provider: string;
  model: string;
  /** رقم إصدار القالب — تغييره يُبطِل كل ما بُني عليه. */
  promptVersion: number;
  /** بصمة المدخل بعد التطبيع. */
  inputHash: string;
}

export function buildCacheKey(input: CacheKeyInput): string {
  const parts = [
    input.taskType,
    input.provider,
    input.model,
    `v${input.promptVersion}`,
    input.inputHash,
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * تطبيع النص قبل البصمة.
 *
 * بدونه يولّد اختلافُ مسافة بيضاء أو سطر جديد بصمةً مختلفة، فتضيع
 * الإصابة ويُدفع ثمن نداء مطابق فعليًا. والتطبيع محافظ عن قصد: يوحّد
 * الفراغات وأطراف النص فقط، ولا يمسّ المحتوى ولا حالة الأحرف — النص
 * المُرسَل للنموذج يجب أن يظل هو نفسه.
 */
export function normalizeForHashing(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** بصمة مستقرة لأي قيمة — ترتيب المفاتيح ثابت. */
export function hashInput(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(normalizeForHashing(value));
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** بصمة قالب البرومبت — تُخزَّن مع كل إصدار وتكشف التعديل الصامت. */
export function hashTemplate(template: string): string {
  return createHash("sha256").update(normalizeForHashing(template)).digest("hex");
}

export interface CacheEntryLike {
  expiresAt: Date;
}

export function isExpired(entry: CacheEntryLike, now: Date = new Date()): boolean {
  return entry.expiresAt.getTime() <= now.getTime();
}

/**
 * أنواع المهام التي **لا تُخزَّن نتائجها إطلاقًا**.
 *
 * السبب ليس الحجم بل المعنى: مهمة تُنتج نتيجة مختلفة عمدًا لنفس المدخل
 * (اقتراح، توليد إبداعي، محادثة) تفقد قيمتها لو أعادت نفس الإجابة.
 * الذاكرة هنا ليست توفيرًا بل عطل في المنتج.
 */
export const UNCACHEABLE_TASKS = new Set<string>(["support_chat", "prompt_refinement"]);

export function isCacheable(taskType: string): boolean {
  return !UNCACHEABLE_TASKS.has(taskType);
}
