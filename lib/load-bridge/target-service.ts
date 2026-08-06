import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret, isSecretCryptoConfigured } from "@/lib/security/secret-crypto";
import { describeTarget, validateTargetConfig, isTargetConfigured } from "./target-adapters";
import type { TargetType } from "./load-types";

/**
 * خدمة وجهات الحمل — تسجيل/تعديل/حذف وجهات الهدف. أي سرّ (connection
 * string / API token) يُشفَّر في `secret_encrypted` ويُزال من config قبل
 * الحفظ — نفس نمط أمان المصادر (0083). لا يُعاد السرّ للواجهة أبدًا.
 */

const UNDEFINED_TABLE = "42P01";
const TABLE = "migration_load_targets";

export interface SafeTargetRow {
  id: string;
  project_id: string | null;
  name: string;
  target_type: TargetType;
  config: Record<string, unknown>;
  configured: boolean;
  status: string;
  hasSecret: boolean;
  last_test: Record<string, unknown>;
  created_at: string;
}

function toSafe(row: Record<string, unknown>): SafeTargetRow {
  const { secret_encrypted, ...rest } = row as Record<string, unknown> & { secret_encrypted?: string | null };
  return { ...(rest as Omit<SafeTargetRow, "hasSecret">), hasSecret: Boolean(secret_encrypted) };
}

export async function listTargets(projectId: string | null, client?: SupabaseClient): Promise<SafeTargetRow[]> {
  const db = client ?? createServiceClient();
  try {
    let q = db.from(TABLE).select("*").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) return [];
    return ((data ?? []) as Array<Record<string, unknown>>).map(toSafe);
  } catch {
    return [];
  }
}

export interface CreateTargetInput {
  projectId: string | null;
  name: string;
  targetType: TargetType;
  config: Record<string, unknown>;
  /** القيمة السرّية النصّية (تُشفَّر قبل الحفظ). */
  secret?: string;
}

export async function createTarget(input: CreateTargetInput, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; id?: string; message?: string }> {
  const db = client ?? createServiceClient();
  const def = describeTarget(input.targetType);
  if (!def) return { ok: false, message: "نوع وجهة غير معروف." };
  if (!input.name.trim()) return { ok: false, message: "اسم الوجهة مطلوب." };

  const cfg = validateTargetConfig(input.targetType, input.config);
  if (!cfg.ok) return { ok: false, message: `إعداد ناقص: ${cfg.missing.join("، ")}` };

  let secretEncrypted: string | null = null;
  if (def.needsSecret && input.secret && input.secret.trim()) {
    if (!isSecretCryptoConfigured()) return { ok: false, message: "لا يمكن حفظ سرّ: MIGRATION_SECRET_KEY غير مضبوط في البيئة." };
    secretEncrypted = encryptSecret(input.secret.trim());
  }

  const configured = isTargetConfigured(input.targetType, input.config, Boolean(secretEncrypted));
  const { data, error } = await db.from(TABLE).insert({
    project_id: input.projectId, name: input.name.trim(), target_type: input.targetType,
    config: input.config, secret_encrypted: secretEncrypted, configured,
    status: configured ? "configured" : "draft", created_by: actorId,
  }).select("id").maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "جداول جسر الحمل غير مطبَّقة (طبّق ترحيل 0091)." };
    return { ok: false, message: error.message };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteTarget(id: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * يختبر جاهزية الوجهة. وجهات الملفات: جاهزة دائمًا. الوجهات المباشرة:
 * يتحقّق من اكتمال الإعداد والسرّ فقط (**بلا اتصال صادر فعلي** — نفس عزل
 * المصادر الحيّة؛ الاتصال الحقيقي عبر موصّل النشر المعزول).
 */
export async function testTarget(id: string, client?: SupabaseClient): Promise<{ ok: boolean; configured: boolean; message: string }> {
  const db = client ?? createServiceClient();
  const { data } = await db.from(TABLE).select("target_type, config, secret_encrypted").eq("id", id).maybeSingle();
  const row = data as { target_type: string; config: Record<string, unknown>; secret_encrypted: string | null } | null;
  if (!row) return { ok: false, configured: false, message: "الوجهة غير موجودة." };

  const def = describeTarget(row.target_type);
  const configured = isTargetConfigured(row.target_type, row.config ?? {}, Boolean(row.secret_encrypted));
  const message = def && !def.realtime
    ? "وجهة تصدير جاهزة — تُنتج حزمة قابلة للتنزيل."
    : configured
      ? "الوجهة مُهيَّأة — الكتابة المباشرة تُنفَّذ عبر موصّل النشر المعزول."
      : "الوجهة غير مُهيَّأة — أكمِل الإعداد والسرّ لتفعيل الكتابة المباشرة.";

  const last_test = { configured, checkedAt: new Date().toISOString(), realtime: def?.realtime ?? false };
  await db.from(TABLE).update({ configured, status: configured ? "configured" : "draft", last_test }).eq("id", id);
  return { ok: true, configured, message };
}
