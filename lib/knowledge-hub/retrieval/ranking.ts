/**
 * ترتيب السياق وضغطه لميزانية — **وحدة نقية بلا I/O**.
 *
 * ## المشكلة اللي بتحلّها
 *
 * البحث الدلالي بيرجّع أقرب النتائج بالتشابه فقط. لكن «الأقرب دلاليًا»
 * مش دايمًا «الأهم للسياق»: معلومة قديمة منخفضة الثقة ممكن تتصدّر على
 * قرار حديث مؤكَّد لمجرّد تطابق كلمات. الترتيب هنا بيوازن **ثلاثة
 * عوامل** — التشابه، الثقة، الحداثة — عشان السياق اللي بيروح للنموذج
 * يكون الأصدق لا الأقرب حرفيًا.
 *
 * والضغط بيحترم **ميزانية**: نافذة النموذج محدودة، وحشو كل النتائج
 * بيزاحم السؤال نفسه. الضغط بياخد الأعلى ترتيبًا لحد الميزانية ويقول
 * صراحةً إيه اللي اتشال.
 */

export interface MemoryCandidate {
  objectType: string;
  objectId: string;
  title: string;
  content: string;
  /** تشابه دلالي ٠–١ من محرّك المتجهات. */
  similarity: number;
  /** ثقة الكائن ٠–١٠٠، اختيارية. */
  confidence?: number;
  /** تاريخ الإنشاء ISO — للحداثة، اختياري. */
  createdAt?: string;
  domain?: string | null;
}

export interface RankedMemory extends MemoryCandidate {
  score: number;
}

export interface RankingWeights {
  similarity: number;
  confidence: number;
  recency: number;
}

/**
 * الأوزان الافتراضية.
 *
 * التشابه الأثقل (٦٠٪): هو المؤشّر الأساسي على الصلة بالسؤال. الثقة
 * (٢٥٪) بتمنع معلومة مشكوك فيها من التصدّر. الحداثة (١٥٪) بتكسر
 * التعادل لصالح الأحدث — الأخفّ لأن معرفة قديمة مؤكّدة تفضل صحيحة.
 */
export const DEFAULT_WEIGHTS: RankingWeights = {
  similarity: 0.6,
  confidence: 0.25,
  recency: 0.15,
};

/** نافذة الحداثة: أحدث من ده = كامل، أقدم من ٣٦٥ يوم = صفر. */
const RECENCY_WINDOW_DAYS = 365;

/**
 * يرتّب المرشّحات بالدرجة المركّبة.
 *
 * `nowMs` يُمرَّر صراحةً (لا `Date.now()` داخليًا) عشان الوحدة تفضل نقية
 * وقابلة للاختبار بزمن ثابت.
 */
export function rankMemories(
  candidates: MemoryCandidate[],
  nowMs: number,
  weights: RankingWeights = DEFAULT_WEIGHTS
): RankedMemory[] {
  const total = weights.similarity + weights.confidence + weights.recency || 1;

  return candidates
    .map((c) => {
      const sim = clamp01(c.similarity);
      const conf = c.confidence === undefined ? 0.6 : clamp01(c.confidence / 100);
      const recency = recencyScore(c.createdAt, nowMs);

      const score =
        (weights.similarity * sim + weights.confidence * conf + weights.recency * recency) / total;

      return { ...c, score: round3(score) };
    })
    .sort((a, b) => b.score - a.score);
}

export interface CompressionResult {
  included: RankedMemory[];
  omitted: RankedMemory[];
  usedChars: number;
  /** أعلى ترتيبًا اتشال بسبب الميزانية — للإفصاح لا الإخفاء. */
  truncated: boolean;
}

/**
 * يختار الأعلى ترتيبًا لحد ميزانية الأحرف.
 *
 * بياخد بالترتيب لحد ما الميزانية تخلص. الكائن اللي مايدخلش كامل
 * **يُستبعَد لا يُقصّ**: نصف قاعدة عمل أخطر من غيابها — بيبان مكتملًا
 * وهو مبتور. الاستبعاد بيتسجّل في `omitted` و`truncated` عشان
 * المستدعي يعرف إن فيه سياق اتشال.
 */
export function compressToBudget(ranked: RankedMemory[], maxChars: number): CompressionResult {
  const included: RankedMemory[] = [];
  const omitted: RankedMemory[] = [];
  let used = 0;
  let truncated = false;

  for (const item of ranked) {
    const cost = item.title.length + item.content.length + 8; // 8 ≈ فواصل وتنسيق
    if (used + cost <= maxChars) {
      included.push(item);
      used += cost;
    } else {
      omitted.push(item);
      truncated = true;
    }
  }

  return { included, omitted, usedChars: used, truncated };
}

/**
 * يبني نصّ السياق النهائي المجمَّع بالنوع.
 *
 * التجميع بالنوع (كل الكيانات معًا، كل القواعد معًا) بيدّي النموذج بنية
 * يقرأ بيها بدل قائمة مسطّحة — نفس منطق تنظيم أي وثيقة.
 */
export function assembleContextText(included: RankedMemory[]): string {
  if (included.length === 0) return "";

  const byType = new Map<string, RankedMemory[]>();
  for (const m of included) {
    const list = byType.get(m.objectType) ?? [];
    list.push(m);
    byType.set(m.objectType, list);
  }

  const sections: string[] = [];
  for (const [type, items] of byType) {
    const lines = items.map((i) => `- ${i.title ? `${i.title}: ` : ""}${i.content}`);
    sections.push(`## ${typeLabel(type)}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

const TYPE_LABELS: Record<string, string> = {
  entity: "الكيانات",
  business_rule: "قواعد العمل",
  workflow: "سير العمل",
  requirement: "المتطلبات",
  decision: "القرارات",
  risk: "المخاطر",
  item: "عناصر المعرفة",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// ============================================================
// أدوات
// ============================================================

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function recencyScore(createdAt: string | undefined, nowMs: number): number {
  if (!createdAt) return 0.5; // بلا تاريخ = محايد
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0.5;
  const ageDays = (nowMs - t) / 86_400_000;
  if (ageDays <= 0) return 1;
  if (ageDays >= RECENCY_WINDOW_DAYS) return 0;
  return 1 - ageDays / RECENCY_WINDOW_DAYS;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
