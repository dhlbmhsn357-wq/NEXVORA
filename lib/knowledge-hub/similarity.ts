/**
 * كشف التكرار الحتمي بين عناصر المعرفة.
 *
 * ليه حتمي قبل الذكاء الاصطناعي: المستندات المهنية بتكرّر نفسها بشراهة —
 * نفس السياسة في الدليل وفي إجراء التشغيل وفي العقد. لو بعتنا كل زوج
 * عناصر للنموذج عشان يقول "دول نفس الحاجة؟"، التكلفة بتتربّع مع كل مستند
 * جديد. الطبقة دي بتشيل التكرار الواضح مجانًا، والنموذج بيتفرّغ للحاجات
 * الدقيقة: التعارض والاعتمادية والصياغة المختلفة لنفس المعنى.
 *
 * الوحدة نقية بالكامل — مفيش I/O ولا استدعاءات.
 */

export interface ComparableItem {
  id: string;
  category: string;
  title: string;
  content: string;
  confidence: number;
  created_at: string;
}

/**
 * كلمات وظيفية عربية وإنجليزية شائعة. وجودها في نصّين مابيدلّش على
 * تشابه، ولو سبناها بتضخّم درجة التشابه لكل العناصر الطويلة.
 */
const STOPWORDS = new Set([
  "من", "في", "على", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
  "أن", "إن", "كان", "يكون", "لا", "ما", "هو", "هي", "قد", "كل", "بعض", "عند",
  "بين", "أو", "ثم", "حتى", "لكن", "بعد", "قبل", "غير", "به", "له", "لها",
  "the", "a", "an", "of", "in", "on", "to", "for", "and", "or", "is", "are",
  "be", "by", "with", "as", "at", "this", "that", "it", "from", "will", "shall",
]);

/** يوحّد النص: تشكيل، تطويل، همزات، تاء مربوطة، ترقيم، مسافات. */
export function normalizeText(value: string): string {
  return value
    .replace(/[ـ]/g, "")
    .replace(/[ً-ْٰ]/g, "")
    // توحيد الهمزات والألف المقصورة والتاء المربوطة: "إجراء" و"اجراء"
    // و"عمليه" و"عملية" لازم يتطابقوا، وإلا التكرار الواضح بيفلت.
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * السوابق العربية المتّصلة. من غير تجريدها "الخصم" و"للخصم" و"بالخصم"
 * بيبقوا كلمات مختلفة، والتكرار الواضح بيفلت — وده بالظبط اللي الوحدة
 * دي موجودة عشانه. مرتّبة من الأطول للأقصر عشان "بال" تتجرّد قبل "ال".
 */
const PREFIXES = ["وبال", "فبال", "كال", "بال", "وال", "فال", "لل", "ال"];

/** أقل طول للجذر بعد التجريد — يمنع تشويه الكلمات القصيرة. */
const MIN_STEM_LENGTH = 3;

/** يجرّد السوابق المتّصلة لو الباقي لسه كلمة معقولة. */
export function stripPrefix(token: string): string {
  for (const prefix of PREFIXES) {
    if (!token.startsWith(prefix)) continue;
    const stem = token.slice(prefix.length);
    if (stem.length >= MIN_STEM_LENGTH) return stem;
  }
  return token;
}

/** يحوّل النص لمجموعة كلمات دالّة مجرّدة من السوابق. */
export function tokenize(value: string): Set<string> {
  const tokens = normalizeText(value)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stripPrefix)
    .filter((t) => t.length > 1);
  return new Set(tokens);
}

/**
 * معامل Dice بين مجموعتي كلمات: 0 لا تشابه، 1 تطابق.
 * اخترناه بدل Jaccard لأنه أقل قسوة على اختلاف الطول، والعنصر المختصر
 * والعنصر المفصّل اللي بيقولوا نفس الحاجة لازم يتطابقوا.
 */
export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/**
 * درجة تشابه عنصرين. العنوان بيتحسب بوزن أعلى من المحتوى لأنه أكثف
 * دلالة — عنصرين بنفس العنوان بالظبط هما نفس المعلومة في الغالب حتى لو
 * الشرح مختلف.
 */
export function itemSimilarity(a: ComparableItem, b: ComparableItem): number {
  const titleScore = diceCoefficient(tokenize(a.title), tokenize(b.title));
  const contentScore = diceCoefficient(tokenize(a.content), tokenize(b.content));
  return titleScore * 0.6 + contentScore * 0.4;
}

/** فوق كده بنعتبرهم نفس المعلومة بلا حاجة لسؤال النموذج. */
export const DUPLICATE_THRESHOLD = 0.82;

/** بين ده والحد الأعلى: مرشّحون يحتاجون حكم النموذج. */
export const CANDIDATE_THRESHOLD = 0.55;

export interface DuplicateGroup {
  /** العنصر اللي هيفضل — الأعلى ثقة، ثم الأطول محتوى، ثم الأقدم. */
  canonicalId: string;
  /** العناصر اللي هتتعلّم `merged` وتشاور على الأساسي. */
  duplicateIds: string[];
  score: number;
}

/**
 * يرتّب مجموعة عناصر متطابقة ويختار الأساسي منها.
 *
 * الترتيب: الثقة الأعلى أولًا (النموذج كان أوثق فيها)، ثم المحتوى الأطول
 * (الصياغة الأشمل)، ثم الأقدم (المصدر الأسبق له الأولوية). القاعدة
 * التالتة مهمة عشان النتيجة تفضل ثابتة مع نفس المدخلات.
 */
export function chooseCanonical(items: ComparableItem[]): ComparableItem {
  return [...items].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.content.length !== a.content.length) return b.content.length - a.content.length;
    return a.created_at.localeCompare(b.created_at);
  })[0];
}

/**
 * يجمّع العناصر المتطابقة داخل نفس التصنيف.
 *
 * المقارنة داخل التصنيف الواحد بس عن قصد: "الحد الأقصى للخصم" كقاعدة عمل
 * و"الحد الأقصى للخصم" كمصطلح حاجتين مختلفتين وظيفيًا حتى لو النص متقارب،
 * ودمجهم كان هيخسّرنا معلومة.
 *
 * الخوارزمية: اتحاد مجموعات (union-find مبسّط) عشان التكرار المتسلسل
 * (أ≈ب و ب≈ج) يتجمّع في مجموعة واحدة بدل مجموعتين متداخلتين.
 */
export function findDuplicateGroups(
  items: ComparableItem[],
  threshold: number = DUPLICATE_THRESHOLD
): DuplicateGroup[] {
  const byCategory = new Map<string, ComparableItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const groups: DuplicateGroup[] = [];

  for (const list of byCategory.values()) {
    if (list.length < 2) continue;

    const parent = new Map<string, string>(list.map((i) => [i.id, i.id]));
    const bestScore = new Map<string, number>();

    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root) as string;
      // ضغط المسار
      let cursor = id;
      while (parent.get(cursor) !== root) {
        const next = parent.get(cursor) as string;
        parent.set(cursor, root);
        cursor = next;
      }
      return root;
    };

    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const score = itemSimilarity(list[i], list[j]);
        if (score < threshold) continue;
        const rootA = find(list[i].id);
        const rootB = find(list[j].id);
        if (rootA !== rootB) parent.set(rootB, rootA);
        const root = find(list[i].id);
        bestScore.set(root, Math.max(bestScore.get(root) ?? 0, score));
      }
    }

    const clusters = new Map<string, ComparableItem[]>();
    for (const item of list) {
      const root = find(item.id);
      const cluster = clusters.get(root) ?? [];
      cluster.push(item);
      clusters.set(root, cluster);
    }

    for (const [root, cluster] of clusters) {
      if (cluster.length < 2) continue;
      const canonical = chooseCanonical(cluster);
      groups.push({
        canonicalId: canonical.id,
        duplicateIds: cluster.filter((i) => i.id !== canonical.id).map((i) => i.id),
        score: bestScore.get(root) ?? threshold,
      });
    }
  }

  return groups;
}

export interface RelationCandidate {
  leftId: string;
  rightId: string;
  score: number;
}

/**
 * أزواج متقاربة لكن مش متطابقة — دي اللي تستاهل حكم النموذج: هل هي
 * تعارض؟ اعتمادية؟ تفصيل لنفس القاعدة؟
 *
 * `maxPairs` سقف صريح: مشروع فيه ٢٠٠٠ عنصر ممكن ينتج آلاف الأزواج،
 * وإرسالها كلها كان هيستهلك الحصة بلا فايدة. بنرتّبها بالدرجة وناخد
 * الأعلى — والسقف بيتسجّل في السجلّ عشان الاقتطاع ما يبقاش صامتًا.
 */
export function findRelationCandidates(
  items: ComparableItem[],
  options: { minScore?: number; maxScore?: number; maxPairs?: number } = {}
): { candidates: RelationCandidate[]; truncated: number } {
  const minScore = options.minScore ?? CANDIDATE_THRESHOLD;
  const maxScore = options.maxScore ?? DUPLICATE_THRESHOLD;
  const maxPairs = options.maxPairs ?? 60;

  const all: RelationCandidate[] = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const score = itemSimilarity(items[i], items[j]);
      if (score < minScore || score >= maxScore) continue;
      all.push({ leftId: items[i].id, rightId: items[j].id, score });
    }
  }

  all.sort((a, b) => b.score - a.score);
  const candidates = all.slice(0, maxPairs);
  return { candidates, truncated: Math.max(0, all.length - candidates.length) };
}
