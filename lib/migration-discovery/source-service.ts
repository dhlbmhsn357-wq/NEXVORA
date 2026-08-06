import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret, isSecretCryptoConfigured } from "@/lib/security/secret-crypto";
import { getSourceType, secretFieldKeys } from "./source-types";
import { testConnectionFromContent } from "./connectors";
import type { MigrationSourceRow, RegisterSourceInput, ConnectionTestSnapshot } from "./types";

/**
 * خدمة المصادر — تسجيل/تعديل/اختبار/حذف مصادر الترحيل.
 *
 * أمان: أي سرّ في connection_config يُنقَل مشفَّرًا إلى secret_encrypted
 * ويُزال من config قبل الحفظ — لا سرّ نصّي في DB أبدًا. الصفوف المُعادة
 * للواجهة **لا تحمل** secret_encrypted (تُجرَّد في التحويل).
 */

const UNDEFINED_TABLE = "42P01";
const TABLE = "migration_sources";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === UNDEFINED_TABLE;
}

/** صفّ آمن للواجهة — بلا السرّ المشفَّر. */
export type SafeSourceRow = Omit<MigrationSourceRow, "secret_encrypted"> & { hasSecret: boolean };

function toSafe(row: MigrationSourceRow): SafeSourceRow {
  const { secret_encrypted, ...rest } = row;
  return { ...rest, hasSecret: Boolean(secret_encrypted) };
}

/** يفصل الحقول السرّية عن الإعدادات، ويشفّرها في سلسلة واحدة. */
function extractAndEncryptSecret(sourceType: string, config: Record<string, unknown>): {
  cleanConfig: Record<string, unknown>;
  secretEncrypted: string | null;
} {
  const secretKeys = secretFieldKeys(sourceType);
  const cleanConfig: Record<string, unknown> = { ...config };
  const secretParts: Record<string, unknown> = {};
  for (const k of secretKeys) {
    if (cleanConfig[k] != null && cleanConfig[k] !== "") {
      secretParts[k] = cleanConfig[k];
    }
    delete cleanConfig[k];
  }
  if (Object.keys(secretParts).length === 0) return { cleanConfig, secretEncrypted: null };
  if (!isSecretCryptoConfigured()) {
    // فشل آمن: لا نخزّن سرًّا نصًّا. نطرح للمستدعي ليعرض رسالة.
    throw new Error("لا يمكن حفظ سرّ: MIGRATION_SECRET_KEY غير مضبوط في البيئة.");
  }
  return { cleanConfig, secretEncrypted: encryptSecret(JSON.stringify(secretParts)) };
}

export async function listSources(projectId: string | null, client?: SupabaseClient): Promise<SafeSourceRow[]> {
  const db = client ?? createServiceClient();
  try {
    let q = db.from(TABLE).select("*").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return [];
      return [];
    }
    return ((data ?? []) as MigrationSourceRow[]).map(toSafe);
  } catch {
    return [];
  }
}

export async function getSource(id: string, client?: SupabaseClient): Promise<SafeSourceRow | null> {
  const db = client ?? createServiceClient();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toSafe(data as MigrationSourceRow);
}

export async function registerSource(
  input: RegisterSourceInput,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; id?: string; message?: string }> {
  const db = client ?? createServiceClient();
  const def = getSourceType(input.sourceType);
  if (!def) return { ok: false, message: "نوع مصدر غير معروف." };
  if (!def.modes.includes(input.connectionMode)) {
    return { ok: false, message: "وضع الاتصال غير مدعوم لهذا النوع." };
  }

  let cleanConfig: Record<string, unknown>;
  let secretEncrypted: string | null;
  try {
    ({ cleanConfig, secretEncrypted } = extractAndEncryptSecret(input.sourceType, input.connectionConfig ?? {}));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل تأمين السرّ." };
  }

  const { data, error } = await db
    .from(TABLE)
    .insert({
      project_id: input.projectId,
      name: input.name.trim(),
      source_type: input.sourceType,
      connection_mode: input.connectionMode,
      status: "draft",
      connection_config: cleanConfig,
      secret_encrypted: secretEncrypted,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return { ok: false, message: "جدول المصادر غير مطبَّق بعد (طبّق ترحيل 0083)." };
    return { ok: false, message: error.message };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateSource(
  id: string,
  patch: Partial<Pick<RegisterSourceInput, "name" | "connectionConfig">>,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const existing = await db.from(TABLE).select("source_type").eq("id", id).maybeSingle();
  if (!existing.data) return { ok: false, message: "المصدر غير موجود." };

  const update: Record<string, unknown> = {};
  if (patch.name != null) update.name = patch.name.trim();
  if (patch.connectionConfig != null) {
    try {
      const { cleanConfig, secretEncrypted } = extractAndEncryptSecret((existing.data as { source_type: string }).source_type, patch.connectionConfig);
      update.connection_config = cleanConfig;
      if (secretEncrypted != null) update.secret_encrypted = secretEncrypted;
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "فشل تأمين السرّ." };
    }
  }
  const { error } = await db.from(TABLE).update(update).eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function setSourceStatus(id: string, status: MigrationSourceRow["status"], client?: SupabaseClient): Promise<void> {
  const db = client ?? createServiceClient();
  await db.from(TABLE).update({ status }).eq("id", id);
}

export async function deleteSource(id: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * يختبر الاتصال/الصلاحية ويخزّن النتيجة. للملفات/الـSchema: يحلّل المحتوى
 * المُمرَّر. للاتصال الحيّ: يرجّع «غير مُهيَّأ» بأمان.
 */
export async function testAndRecordConnection(
  id: string,
  content: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; result: ConnectionTestSnapshot; message?: string }> {
  const db = client ?? createServiceClient();
  const src = await db.from(TABLE).select("source_type, connection_mode").eq("id", id).maybeSingle();
  if (!src.data) return { ok: false, result: emptyTest(), message: "المصدر غير موجود." };

  const { source_type, connection_mode } = src.data as { source_type: string; connection_mode: MigrationSourceRow["connection_mode"] };
  const result = testConnectionFromContent(source_type, connection_mode, content);

  await db
    .from(TABLE)
    .update({ last_connection_test: result, last_tested_at: new Date().toISOString(), status: result.ok ? "connected" : "draft" })
    .eq("id", id);

  return { ok: result.ok, result };
}

function emptyTest(): ConnectionTestSnapshot {
  return { ok: false, configured: false, durationMs: 0, version: null, dbType: null, tableCount: 0, approxSize: null, issues: [] };
}
