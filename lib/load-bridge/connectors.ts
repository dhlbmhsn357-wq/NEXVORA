import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/security/secret-crypto";
import type { LoadRow } from "./load-types";

/**
 * موصّلات الحمل الحقيقية — الكتابة الفعلية في نظام الهدف.
 *
 * REST API: عبر `fetch` القياسي (بلا مكتبات). يمرّ عبر واجهة الـ ERP فيحترم
 * منطق أعماله — الأأمن. Supabase: عبر العميل الموجود (insert/upsert).
 *
 * الجزء النقيّ (بناء الترويسات/الجسم/تقسيم الدفعات/تصنيف الحالة) مفصول
 * وقابل للاختبار بلا شبكة؛ الجزء الشبكيّ رفيع.
 */

// ────────────────────────────────────────────────────────────
// نقيّ — قابل للاختبار بلا I/O
// ────────────────────────────────────────────────────────────

export function chunkRows(rows: LoadRow[], size: number): LoadRow[][] {
  const s = Math.max(1, Math.min(2000, size || 500));
  const out: LoadRow[][] = [];
  for (let i = 0; i < rows.length; i += s) out.push(rows.slice(i, i + s));
  return out;
}

/** يستبدل {entity} في قالب الـ URL. يزيل أي شرطة مائلة مكرّرة في الذيل. */
export function resolveEndpoint(template: string, entity: string): string {
  const url = (template || "").includes("{entity}")
    ? template.replace(/\{entity\}/g, encodeURIComponent(entity))
    : `${template.replace(/\/+$/, "")}/${encodeURIComponent(entity)}`;
  return url;
}

export function buildAuthHeaders(authType: string, token: string, headerName?: string): Record<string, string> {
  const t = (authType || "bearer").toLowerCase();
  if (t === "none" || !token) return {};
  if (t === "apikey") return { [headerName && headerName.trim() ? headerName.trim() : "x-api-key"]: token };
  return { Authorization: `Bearer ${token}` };
}

/** array: يرسل مصفوفة الصفوف مباشرة. wrapped: يلفّها في {rows:[...]}. */
export function buildRequestBody(rows: LoadRow[], bodyMode: string, wrapperKey = "rows"): unknown {
  return (bodyMode || "array").toLowerCase() === "wrapped" ? { [wrapperKey]: rows } : rows;
}

export function classifyDirectStatus(expected: number, loaded: number, errorCount: number): "completed" | "partial" | "failed" {
  if (loaded === 0 && expected > 0) return "failed";
  if (loaded < expected || errorCount > 0) return "partial";
  return "completed";
}

// ────────────────────────────────────────────────────────────
// شبكيّ — الكتابة الفعلية
// ────────────────────────────────────────────────────────────

export interface EntityRows {
  entity: string;
  rows: LoadRow[];
}

export interface DirectLoadResult {
  ok: boolean;
  loadedByEntity: Record<string, number>;
  failedByEntity: Record<string, number>;
  errors: string[];
}

const MAX_ATTEMPTS = 3;

async function backoff(attempt: number): Promise<void> {
  const ms = 300 * 2 ** (attempt - 1);
  await new Promise((r) => setTimeout(r, ms));
}

/** موصّل REST — يدفع دفعات لكل كيان عبر HTTP مع إعادة محاولة. */
async function restConnector(config: Record<string, unknown>, token: string, entities: EntityRows[]): Promise<DirectLoadResult> {
  const endpoint = String(config.endpoint ?? "");
  const authHeaders = buildAuthHeaders(String(config.authType ?? "bearer"), token, config.authHeaderName as string | undefined);
  const bodyMode = String(config.bodyMode ?? "array");
  const batchSize = Number(config.batchSize ?? 200);
  const method = String(config.method ?? "POST").toUpperCase();

  const loadedByEntity: Record<string, number> = {};
  const failedByEntity: Record<string, number> = {};
  const errors: string[] = [];

  for (const { entity, rows } of entities) {
    loadedByEntity[entity] = 0;
    failedByEntity[entity] = 0;
    const url = resolveEndpoint(endpoint, entity);

    for (const batch of chunkRows(rows, batchSize)) {
      let ok = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
        try {
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify(buildRequestBody(batch, bodyMode)),
          });
          if (res.ok) {
            ok = true;
          } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            errors.push(`${entity}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
            break; // أخطاء العميل لا تُعاد.
          } else if (attempt < MAX_ATTEMPTS) {
            await backoff(attempt);
          } else {
            errors.push(`${entity}: HTTP ${res.status} بعد ${MAX_ATTEMPTS} محاولات.`);
          }
        } catch (err) {
          if (attempt < MAX_ATTEMPTS) await backoff(attempt);
          else errors.push(`${entity}: ${(err as Error).message}`);
        }
      }
      if (ok) loadedByEntity[entity] += batch.length;
      else failedByEntity[entity] += batch.length;
    }
  }

  return { ok: errors.length === 0, loadedByEntity, failedByEntity, errors };
}

/** موصّل Supabase — insert/upsert مباشر على قاعدة الهدف عبر العميل الموجود. */
async function supabaseConnector(config: Record<string, unknown>, serviceKey: string, entities: EntityRows[]): Promise<DirectLoadResult> {
  const url = String(config.url ?? "");
  const prefix = String(config.tablePrefix ?? "");
  const onConflict = String(config.onConflict ?? "").trim();
  const batchSize = Number(config.batchSize ?? 500);

  const loadedByEntity: Record<string, number> = {};
  const failedByEntity: Record<string, number> = {};
  const errors: string[] = [];

  if (!url || !serviceKey) {
    return { ok: false, loadedByEntity, failedByEntity, errors: ["رابط الهدف أو مفتاح service_role مفقود."] };
  }

  const target = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  for (const { entity, rows } of entities) {
    loadedByEntity[entity] = 0;
    failedByEntity[entity] = 0;
    const table = `${prefix}${entity}`;

    for (const batch of chunkRows(rows, batchSize)) {
      let ok = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
        try {
          const q = onConflict
            ? target.from(table).upsert(batch, { onConflict })
            : target.from(table).insert(batch);
          const { error } = await q;
          if (!error) ok = true;
          else if (attempt < MAX_ATTEMPTS) await backoff(attempt);
          else errors.push(`${entity} (${table}): ${error.message}`);
        } catch (err) {
          if (attempt < MAX_ATTEMPTS) await backoff(attempt);
          else errors.push(`${entity} (${table}): ${(err as Error).message}`);
        }
      }
      if (ok) loadedByEntity[entity] += batch.length;
      else failedByEntity[entity] += batch.length;
    }
  }

  return { ok: errors.length === 0, loadedByEntity, failedByEntity, errors };
}

/**
 * ينفّذ الحمل المباشر حسب نوع الوجهة. يفكّ السرّ المُشفَّر داخليًّا فقط
 * (لا يُمرَّر السرّ نصًّا من الخارج). يُرجِع أعداد الكتابة الفعلية.
 */
export async function runDirectLoad(
  targetType: string,
  config: Record<string, unknown>,
  secretEncrypted: string | null,
  entities: EntityRows[]
): Promise<DirectLoadResult> {
  let token = "";
  if (secretEncrypted) {
    try {
      token = decryptSecret(secretEncrypted);
    } catch {
      return { ok: false, loadedByEntity: {}, failedByEntity: {}, errors: ["تعذّر فكّ سرّ الوجهة (المفتاح تغيّر؟)."] };
    }
  }

  if (targetType === "rest_api") return restConnector(config, token, entities);
  if (targetType === "supabase") return supabaseConnector(config, token, entities);
  return { ok: false, loadedByEntity: {}, failedByEntity: {}, errors: [`الحمل المباشر غير مدعوم لنوع الوجهة ${targetType} في هذا الإصدار.`] };
}
