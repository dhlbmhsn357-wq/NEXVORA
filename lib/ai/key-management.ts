import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret, isSecretCryptoConfigured } from "@/lib/security/secret-crypto";
import { invalidateKeyCache, invalidateOpenAIKeyCache } from "./key-store";

/**
 * إدارة مفاتيح مزوّدي الذكاء الاصطناعي المخزّنة في قاعدة البيانات (مصدر
 * مشترك عبر البيئات: Vercel + Railway). الأسرار تُشفَّر قبل الحفظ ولا
 * تُعاد للواجهة أبدًا — فقط تلميح آخر ٤ محارف.
 *
 * المزوّد افتراضيه 'gemini' للتوافق الخلفي مع كل النداءات القديمة.
 */

const TABLE = "ai_provider_keys";
const UNDEFINED_TABLE = "42P01";

export type KeyTier = "free" | "paid";
export type KeyProvider = "gemini" | "openai";

export interface AiKeyRow {
  id: string;
  provider: KeyProvider;
  tier: KeyTier;
  label: string;
  key_hint: string;
  active: boolean;
  created_at: string;
}

function invalidateFor(provider: KeyProvider): void {
  if (provider === "openai") invalidateOpenAIKeyCache();
  else invalidateKeyCache();
}

/** يسرد مفاتيح مزوّد معيّن (افتراضيًّا gemini). OpenAI مفيش عنده Free tier. */
export async function listAiKeys(provider: KeyProvider = "gemini"): Promise<AiKeyRow[]> {
  const db = createServiceClient();
  try {
    const { data, error } = await db
      .from(TABLE)
      .select("id, provider, tier, label, key_hint, active, created_at")
      .eq("provider", provider)
      .order("tier", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []) as AiKeyRow[];
  } catch {
    return [];
  }
}

export async function addAiKey(
  tier: KeyTier,
  rawKey: string,
  label: string,
  actorId: string | null,
  provider: KeyProvider = "gemini"
): Promise<{ ok: boolean; message?: string }> {
  const key = (rawKey ?? "").trim();
  const providerLabel = provider === "openai" ? "OpenAI" : "Gemini";
  if (key.length < 10) return { ok: false, message: `المفتاح غير صالح — الصق مفتاح ${providerLabel} كاملًا.` };
  if (tier !== "free" && tier !== "paid") return { ok: false, message: "نوع غير معروف." };
  if (!isSecretCryptoConfigured()) {
    return { ok: false, message: "MIGRATION_SECRET_KEY غير مضبوط في البيئة — مطلوب لتشفير المفاتيح. اضبطه في Vercel وRailway (متغيّر واحد ثابت) ثم أعِد المحاولة." };
  }

  // OpenAI مفيش عنده Free tier — أي مفتاح OpenAI يُخزَّن كـ paid.
  const effectiveTier: KeyTier = provider === "openai" ? "paid" : tier;

  const db = createServiceClient();
  const ins = await db.from(TABLE).insert({
    provider,
    tier: effectiveTier,
    label: label.trim() || (effectiveTier === "paid" ? "مفتاح مدفوع" : "مفتاح مجاني"),
    key_encrypted: encryptSecret(key),
    key_hint: key.slice(-4),
    active: true,
    created_by: actorId,
  });
  if (ins.error) {
    if (ins.error.code === UNDEFINED_TABLE) return { ok: false, message: "جدول المفاتيح غير مطبَّق (طبّق ترحيل 0092)." };
    // قيد CHECK قديم لسه ما اتوسّعش (0094 لسه ما اتطبّقش) — رسالة واضحة.
    if (ins.error.code === "23514") return { ok: false, message: "قاعدة البيانات لسه ما بتقبلش مزوّد OpenAI — طبّق ترحيل 0094 الأول." };
    return { ok: false, message: ins.error.message };
  }
  invalidateFor(provider);
  return { ok: true, message: "أُضيف المفتاح — سيُستخدم في كل البيئات خلال دقيقة." };
}

export async function deleteAiKey(id: string): Promise<{ ok: boolean; message?: string }> {
  const db = createServiceClient();
  // نقرأ المزوّد قبل الحذف عشان نُبطِل الكاش الصحيح.
  const { data: row } = await db.from(TABLE).select("provider").eq("id", id).maybeSingle();
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  invalidateFor(((row as { provider?: KeyProvider } | null)?.provider) ?? "gemini");
  return { ok: true };
}

export async function setAiKeyActive(id: string, active: boolean): Promise<{ ok: boolean; message?: string }> {
  const db = createServiceClient();
  const { data: row } = await db.from(TABLE).select("provider").eq("id", id).maybeSingle();
  const { error } = await db.from(TABLE).update({ active }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  invalidateFor(((row as { provider?: KeyProvider } | null)?.provider) ?? "gemini");
  return { ok: true };
}
