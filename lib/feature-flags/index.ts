/**
 * NEXVORA Feature Flags — Reader
 * ==============================
 *
 * الأساس المركزي لكل توجيه ميزات NEXVORA. أي ميزة جديدة أو مخفية بتُقرأ
 * من هنا بدل ما تنتشر شروط `if` في كل الكود.
 *
 * القاعدة:
 *   • flag `enabled_globally = true`  → يُطبَّق على الكل، ما عدا user في
 *     `enabled_per_user` (rollout معكوس = disable لمستخدم بعينه).
 *   • flag `enabled_globally = false` → يُعطَّل عن الكل، ما عدا user في
 *     `enabled_per_user` (Beta test = enable لمستخدم بعينه).
 *
 * الاستخدام:
 *   ```ts
 *   import { isFeatureEnabled } from "@/lib/feature-flags";
 *   if (await isFeatureEnabled("product_mode", userId)) { ... }
 *   ```
 *
 * الأداء: كاش داخل الطلب (in-memory) لتفادي ضربات DB متكررة على
 * نفس الـ request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/** أسماء الـ flags المعروفة — أي flag جديد يُضاف هنا للحصول على type safety. */
export const KNOWN_FLAGS = [
  "product_mode",
  "extended_technical_delivery",
  "prototype_studio",
] as const;

export type KnownFlagName = (typeof KNOWN_FLAGS)[number];

export interface FeatureFlagRow {
  name: string;
  description: string;
  enabled_globally: boolean;
  enabled_per_user: string[];
  updated_at: string;
  updated_by: string | null;
}

// كاش داخل الـ process (بيكفي لـ Next.js server runtime — كل طلب بيمشي
// على process warm عادة، والقيم مش بتتغير كل ثانية).
let cache: Map<string, FeatureFlagRow> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 60 ثانية

function isCacheFresh(): boolean {
  return cache !== null && Date.now() < cacheExpiresAt;
}

/** يفرغ الكاش — يُستدعى بعد أي تحديث لضمان قراءة القيم الجديدة فورًا. */
export function invalidateFeatureFlagsCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}

async function loadAllFlags(client?: SupabaseClient): Promise<Map<string, FeatureFlagRow>> {
  if (isCacheFresh() && cache) return cache;

  const supabase = client ?? createServiceClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("name, description, enabled_globally, enabled_per_user, updated_at, updated_by");

  if (error) {
    // في حال فشل القراءة، نعتمد fallback آمن: كل flag = false
    // (بدل ما نكشف Extended Technical Delivery بالخطأ).
    console.error("[feature-flags] load failed:", error.message);
    return new Map();
  }

  const map = new Map<string, FeatureFlagRow>();
  for (const row of (data ?? []) as FeatureFlagRow[]) {
    map.set(row.name, row);
  }
  cache = map;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return map;
}

/**
 * الاستعلام الأساسي: هل الميزة مفعّلة لهذا المستخدم؟
 * userId اختياري — لو غير مذكور، بنعتمد على enabled_globally فقط.
 */
export async function isFeatureEnabled(
  name: KnownFlagName | string,
  userId?: string | null,
  client?: SupabaseClient
): Promise<boolean> {
  const flags = await loadAllFlags(client);
  const row = flags.get(name);
  if (!row) {
    // flag غير موجود → default disabled (fail-safe).
    return false;
  }
  const inOverride = userId ? row.enabled_per_user.includes(userId) : false;
  // enabled_per_user يعكس السلوك عن enabled_globally.
  return inOverride ? !row.enabled_globally : row.enabled_globally;
}

/** يجيب كل الـ flags — للـ Settings UI. */
export async function listFeatureFlags(
  client?: SupabaseClient
): Promise<FeatureFlagRow[]> {
  const flags = await loadAllFlags(client);
  return [...flags.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * تحديث flag من واجهة الإدارة (service client فقط — لا يُنادى من client).
 * بيبطل الكاش تلقائيًا.
 */
export async function updateFeatureFlag(
  name: string,
  patch: {
    enabled_globally?: boolean;
    enabled_per_user?: string[];
    description?: string;
    updated_by?: string | null;
  }
): Promise<{ ok: true; row: FeatureFlagRow } | { ok: false; message: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .update({
      ...(patch.enabled_globally !== undefined && { enabled_globally: patch.enabled_globally }),
      ...(patch.enabled_per_user !== undefined && { enabled_per_user: patch.enabled_per_user }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.updated_by !== undefined && { updated_by: patch.updated_by }),
    })
    .eq("name", name)
    .select()
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: `Flag "${name}" غير موجود.` };

  invalidateFeatureFlagsCache();
  return { ok: true, row: data as FeatureFlagRow };
}
