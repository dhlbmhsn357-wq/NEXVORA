"use server";

import { requireAdmin } from "@/lib/auth/rbac";
import { listAiKeys, addAiKey, deleteAiKey, setAiKeyActive, type AiKeyRow, type KeyTier, type KeyProvider } from "@/lib/ai/key-management";

/**
 * إجراءات مدير مفاتيح الذكاء الاصطناعي — Owner/Admin فقط. المفاتيح تُخزَّن
 * مشفَّرة وتُقرأ من كل بيئات التشغيل (Vercel + Railway) من مصدر واحد.
 */

export async function getAiKeys(provider: KeyProvider = "gemini"): Promise<{ ok: boolean; keys: AiKeyRow[] }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, keys: [] };
  return { ok: true, keys: await listAiKeys(provider) };
}

export async function createAiKey(
  tier: KeyTier,
  rawKey: string,
  label: string,
  provider: KeyProvider = "gemini"
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  return addAiKey(tier, rawKey, label, auth.userId ?? null, provider);
}

export async function removeAiKey(id: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  return deleteAiKey(id);
}

export async function toggleAiKey(id: string, active: boolean): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  return setAiKeyActive(id, active);
}
