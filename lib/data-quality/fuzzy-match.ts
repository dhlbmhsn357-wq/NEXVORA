/**
 * المطابقة التقريبية والصوتية — **وحدة نقية بلا I/O**.
 *
 * جوهر كشف التكرار: «Mohamed Ali / محمد علي / Mohamad Aly» قد يكونوا نفس
 * الشخص. لا نعتمد على التطابق الحرفي، بل على: تطبيع (عربي/لاتيني) +
 * Levenshtein + تشابه Jaro-Winkler-ish + بصمة صوتية.
 */

/** يطبّع نصًّا للمقارنة: حالة، تشكيل، همزات، تطويل، مسافات، رموز. */
export function normalizeForMatch(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "") // تشكيل
    .replace(/ـ/g, "") // تطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^0-9a-zء-ي\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** مسافة Levenshtein (تحرير). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** تشابه نصّي ٠-١ من Levenshtein المطبَّع بالطول. */
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * تشابه مبنيّ على الرموز (Token) — يتحمّل اختلاف ترتيب الكلمات
 * («محمد علي» ≈ «علي محمد») واختلاف بسيط في كل كلمة.
 */
export function tokenSimilarity(a: string, b: string): number {
  const ta = normalizeForMatch(a).split(" ").filter(Boolean);
  const tb = normalizeForMatch(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let matched = 0;
  const used = new Set<number>();
  for (const t of small) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < large.length; i++) {
      if (used.has(i)) continue;
      const s = t === large[i] ? 1 : similarity(t, large[i]);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (bestScore >= 0.8 && best >= 0) {
      used.add(best);
      matched += bestScore;
    }
  }
  return matched / Math.max(ta.length, tb.length);
}

/**
 * بصمة صوتية مبسّطة (Soundex-like للاتيني + طيّ الحروف العربية المتقاربة).
 * كلمتان بنفس البصمة يُرجَّح تشابههما صوتيًا (Aly ≈ Ali).
 */
export function phoneticKey(text: string): string {
  const n = normalizeForMatch(text).replace(/\s+/g, "");
  if (n.length === 0) return "";
  // طيّ الحروف اللاتينية المتقاربة صوتيًا.
  const latin = n
    .replace(/[aeiouy]/g, "a")
    .replace(/[bp]/g, "b")
    .replace(/[fv]/g, "f")
    .replace(/[sz]/g, "s")
    .replace(/[dt]/g, "d")
    .replace(/[gkq]/g, "k")
    .replace(/[mn]/g, "m")
    .replace(/(.)\1+/g, "$1"); // إزالة التكرار
  return latin.slice(0, 8);
}

/**
 * أفضل درجة تشابه شاملة (٠-١٠٠) بين قيمتين — يجمع أقوى إشارة من
 * التشابه الرمزي والحرفي والصوتي.
 */
export function bestMatchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 100;
  const tok = tokenSimilarity(a, b);
  const sim = similarity(a, b);
  let score = Math.max(tok, sim);
  // تعزيز صوتي.
  if (phoneticKey(a) && phoneticKey(a) === phoneticKey(b)) score = Math.max(score, 0.85);
  return Math.round(score * 100);
}
