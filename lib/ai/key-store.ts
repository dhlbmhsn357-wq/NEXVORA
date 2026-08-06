import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, isSecretCryptoConfigured } from "@/lib/security/secret-crypto";

/**
 * مخزن مفاتيح Gemini — **مصدر مشترك عبر كل بيئات التشغيل**.
 *
 * المشكلة: المفاتيح في متغيّرات البيئة تحتاج ضبطًا منفصلًا في Vercel و
 * Railway، وأي عدم تطابق = وقوع صامت على المفاتيح المجانية.
 *
 * الحل: هنا نقرأ المفاتيح من **قاعدة البيانات** (مشفَّرة) ونَدمِجها مع
 * متغيّرات البيئة. أي بيئة متصلة بـ Supabase تحصل على نفس المفاتيح — فتُضبط
 * مرة واحدة من الواجهة. متغيّرات البيئة تظل تعمل (دمج لا إلغاء).
 *
 * التجزئة النقيّة (الدمج وإزالة التكرار) مفصولة وقابلة للاختبار.
 */

export interface GeminiKeySet {
  free: string[];
  paid: string[];
}

// ── نقيّ ──

/** يقسّم قيمة متغيّر بيئة (مفتاح أو عدة مفاتيح مفصولة بفاصلة). */
export function splitKeys(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

/**
 * يدمج مفاتيح البيئة مع مفاتيح قاعدة البيانات ويزيل التكرار. المفتاح
 * الموجود في «المدفوع» له الأولوية: لا يظهر في «المجاني» حتى لو تكرر —
 * فيُجرَّب كمدفوع (حصته أعلى) بلا استهلاك مزدوج.
 */
export function mergeKeys(envFree: string[], envPaid: string[], dbFree: string[], dbPaid: string[]): GeminiKeySet {
  const paid = [...new Set([...envPaid, ...dbPaid])];
  const paidSet = new Set(paid);
  const free = [...new Set([...envFree, ...dbFree])].filter((k) => !paidSet.has(k));
  return { free, paid };
}

// ── I/O مع تخزين مؤقّت ──

const CACHE_TTL_MS = 60_000;
let cache: { at: number; keys: GeminiKeySet } | null = null;

/** يُبطِل التخزين المؤقّت — يُستدعى بعد أي تعديل على المفاتيح لتُلتقَط فورًا. */
export function invalidateKeyCache(): void {
  cache = null;
}

/** يقرأ مفاتيح Gemini النشطة من قاعدة البيانات ويفكّها. رشيق: أي خطأ = فارغ. */
async function loadDbKeys(): Promise<GeminiKeySet> {
  if (!isSecretCryptoConfigured()) return { free: [], paid: [] };
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("ai_provider_keys")
      .select("tier, key_encrypted")
      .eq("provider", "gemini")
      .eq("active", true);
    if (error || !data) return { free: [], paid: [] };

    const free: string[] = [];
    const paid: string[] = [];
    for (const row of data as Array<{ tier: string; key_encrypted: string }>) {
      try {
        const key = decryptSecret(row.key_encrypted);
        if (row.tier === "paid") paid.push(key);
        else free.push(key);
      } catch {
        /* مفتاح تالف/مفتاح تشفير مختلف — تخطّاه بأمان */
      }
    }
    return { free, paid };
  } catch {
    return { free: [], paid: [] };
  }
}

/**
 * المفاتيح المدموجة (بيئة + قاعدة بيانات) مع تخزين مؤقّت قصير — يتفادى
 * ضرب القاعدة في كل استدعاء AI مع بقاء التغييرات تلتقَط خلال دقيقة.
 */
export async function getMergedGeminiKeys(): Promise<GeminiKeySet> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.keys;

  const envFree = splitKeys(process.env.GEMINI_API_KEY);
  for (let i = 2; i <= 10; i++) envFree.push(...splitKeys(process.env[`GEMINI_API_KEY_${i}`]));
  const envPaid = splitKeys(process.env.GEMINI_API_KEY_PAID);

  const dbKeys = await loadDbKeys();
  const merged = mergeKeys(envFree, envPaid, dbKeys.free, dbKeys.paid);

  cache = { at: now, keys: merged };
  return merged;
}

// ─────────────────────────────────────────────────────────────
// OpenAI — نفس فكرة المصدر المشترك (بيئة + قاعدة بيانات مشفَّرة).
// OpenAI مفيش عنده Free Tier، فكل المفاتيح تُعامَل كقائمة واحدة مدموجة
// ومُزالة التكرار. أي بيئة (Vercel/Railway) تقرأ نفس المفاتيح.
// ─────────────────────────────────────────────────────────────

let openaiCache: { at: number; keys: string[] } | null = null;

/** يبطل تخزين مفاتيح OpenAI المؤقّت (يُستدعى بعد أي تعديل عليها). */
export function invalidateOpenAIKeyCache(): void {
  openaiCache = null;
}

/** يقرأ مفاتيح OpenAI النشطة من قاعدة البيانات ويفكّها. رشيق: أي خطأ = فارغ. */
async function loadDbOpenAIKeys(): Promise<string[]> {
  if (!isSecretCryptoConfigured()) return [];
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("ai_provider_keys")
      .select("key_encrypted")
      .eq("provider", "openai")
      .eq("active", true);
    if (error || !data) return [];
    const keys: string[] = [];
    for (const row of data as Array<{ key_encrypted: string }>) {
      try {
        keys.push(decryptSecret(row.key_encrypted));
      } catch {
        /* مفتاح تالف/مفتاح تشفير مختلف — تخطّاه بأمان */
      }
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * مفاتيح OpenAI المدموجة (بيئة OPENAI_API_KEY[_2..10] + قاعدة البيانات)،
 * مُزالة التكرار، مع تخزين مؤقّت قصير.
 */
export async function getMergedOpenAIKeys(): Promise<string[]> {
  const now = Date.now();
  if (openaiCache && now - openaiCache.at < CACHE_TTL_MS) return openaiCache.keys;

  const envKeys = splitKeys(process.env.OPENAI_API_KEY);
  for (let i = 2; i <= 10; i++) envKeys.push(...splitKeys(process.env[`OPENAI_API_KEY_${i}`]));

  const dbKeys = await loadDbOpenAIKeys();
  const merged = [...new Set([...envKeys, ...dbKeys])];

  openaiCache = { at: now, keys: merged };
  return merged;
}
