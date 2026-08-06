import { estimateTokens } from "../cost/calculator";
import { normalizeForHashing } from "../cache/keys";

/**
 * مدير السياق — وحدة نقية.
 *
 * مسؤول عن: الجمع، والتنظيف، والتقليل، وإزالة التكرار، والتقسيم — قبل
 * إرسال أي شيء للنموذج.
 *
 * ## لماذا الترتيب مهم
 *
 * التنظيف ثم إزالة التكرار ثم التقليل ثم التقسيم. عكسه يعطي نتائج
 * أسوأ: التقسيم قبل إزالة التكرار يوزّع نسخًا مكرّرة على مقاطع مختلفة
 * فلا تُكتشف، والتقليل قبل التنظيف يحذف محتوى مفيدًا ويُبقي ضوضاء.
 */

export interface ContextPiece {
  /** مصدر المقطع — يظهر للنموذج ليعرف من أين جاءت المعلومة. */
  source: string;
  content: string;
  /** أهمية نسبية: الأعلى يُحتفَظ به عند التقليل. */
  weight?: number;
}

export interface AssembledContext {
  pieces: ContextPiece[];
  text: string;
  estimatedTokens: number;
  droppedPieces: number;
  duplicatePieces: number;
}

/**
 * محارف التحكّم — تصل من ملفات مستخرَجة (PDF · Word) وتستهلك رموزًا
 * مدفوعة الثمن بلا أي معنى للنموذج. مكتوبة بصيغة هروب صريحة لأن
 * كتابتها خامًا تجعل النمط غير مقروء وعرضة للتلف عند أي تحرير.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** المسافة غير الفاصلة — تبدو كمسافة عادية وتكسر المطابقة بصمت. */
const NBSP = /\u00A0/g;

/** ينظّف مقطعًا: مسافات، أسطر مكرّرة، محارف تحكّم. */
export function cleanPiece(content: string): string {
  return normalizeForHashing(content.replace(CONTROL_CHARS, "").replace(NBSP, " "));
}

/**
 * يزيل المقاطع المكرّرة.
 *
 * المقارنة بالمحتوى المنظَّف لا الخام: مقطعان يختلفان في مسافة واحدة
 * مكرّران فعليًا، وإبقاؤهما يدفع ثمن رموزهما مرتين.
 */
export function dedupePieces(pieces: ContextPiece[]): {
  pieces: ContextPiece[];
  removed: number;
} {
  const seen = new Set<string>();
  const out: ContextPiece[] = [];
  let removed = 0;

  for (const piece of pieces) {
    const cleaned = cleanPiece(piece.content);
    if (!cleaned) continue;
    if (seen.has(cleaned)) {
      removed += 1;
      continue;
    }
    seen.add(cleaned);
    out.push({ ...piece, content: cleaned });
  }

  return { pieces: out, removed };
}

/**
 * يقلّل السياق ليدخل في ميزانية الرموز.
 *
 * الترتيب بالأهمية ثم الحذف من الأدنى. **لا يقتطع منتصف المقطع**:
 * نصف جدول أو نصف قائمة يضلّل النموذج أكثر مما ينفعه — الحذف الكامل
 * للمقطع الأقل أهمية أصدق من إبقاء شظية منه.
 */
export function reduceToBudget(
  pieces: ContextPiece[],
  maxTokens: number
): { pieces: ContextPiece[]; dropped: number } {
  const sorted = [...pieces].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

  const kept: ContextPiece[] = [];
  let used = 0;

  for (const piece of sorted) {
    const cost = estimateTokens(piece.content);
    if (used + cost > maxTokens) continue;
    kept.push(piece);
    used += cost;
  }

  // إعادة الترتيب الأصلي: الترتيب حسب الأهمية أداة اختيار لا عرض،
  // والنموذج يقرأ السياق كسرد متسلسل.
  const order = new Map(pieces.map((p, i) => [p, i]));
  kept.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return { pieces: kept, dropped: pieces.length - kept.length };
}

/** يبني نص السياق النهائي مع ترويسة مصدر لكل مقطع. */
export function renderContext(pieces: ContextPiece[]): string {
  return pieces.map((p) => `## ${p.source}\n${p.content}`).join("\n\n");
}

export function assembleContext(
  raw: ContextPiece[],
  options: { maxTokens?: number } = {}
): AssembledContext {
  const { pieces: deduped, removed } = dedupePieces(raw);
  const { pieces: kept, dropped } = options.maxTokens
    ? reduceToBudget(deduped, options.maxTokens)
    : { pieces: deduped, dropped: 0 };

  const text = renderContext(kept);

  return {
    pieces: kept,
    text,
    estimatedTokens: estimateTokens(text),
    droppedPieces: dropped,
    duplicatePieces: removed,
  };
}

// ============================================================
// التقسيم والدمج
// ============================================================

export interface Chunk {
  index: number;
  total: number;
  pieces: ContextPiece[];
  text: string;
  estimatedTokens: number;
}

/**
 * يقسّم السياق على مقاطع تدخل كل منها في الميزانية.
 *
 * التقسيم **على حدود المقاطع لا على حدود الأحرف**: قطع مقطع في منتصفه
 * يرسل للنموذج نصف جملة، والنتيجة تبدو معقولة وهي مبنية على معلومة
 * ناقصة — وهذا أخطر من الفشل الصريح.
 *
 * المقطع الأكبر من الميزانية بمفرده يُرسَل وحده مع تحذير، لأن تجاهله
 * فقدان بيانات صامت.
 */
export function chunkContext(pieces: ContextPiece[], maxTokensPerChunk: number): Chunk[] {
  if (pieces.length === 0) return [];

  const groups: ContextPiece[][] = [];
  let current: ContextPiece[] = [];
  let currentTokens = 0;

  for (const piece of pieces) {
    const cost = estimateTokens(piece.content);

    if (cost > maxTokensPerChunk) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
        currentTokens = 0;
      }
      groups.push([piece]);
      continue;
    }

    if (currentTokens + cost > maxTokensPerChunk && current.length > 0) {
      groups.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(piece);
    currentTokens += cost;
  }

  if (current.length > 0) groups.push(current);

  return groups.map((group, index) => {
    const text = renderContext(group);
    return {
      index,
      total: groups.length,
      pieces: group,
      text,
      estimatedTokens: estimateTokens(text),
    };
  });
}

export interface ChunkResult<T> {
  index: number;
  output: T;
}

/**
 * يدمج نتائج المقاطع.
 *
 * الدمج **بترتيب المقاطع لا بترتيب الوصول**: المقاطع تُنفَّذ بالتوازي
 * فتصل بترتيب عشوائي، ودمجها كما وصلت يخلط تسلسل المحتوى.
 */
export function mergeChunkResults<T>(results: ChunkResult<T>[]): T[] {
  return [...results].sort((a, b) => a.index - b.index).map((r) => r.output);
}

/** يدمج مصفوفات المقاطع في مصفوفة واحدة بلا تكرار. */
export function mergeChunkedArrays<T>(
  results: ChunkResult<T[]>[],
  keyOf: (item: T) => string
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const chunk of mergeChunkResults(results)) {
    for (const item of chunk) {
      const key = keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}
