import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_POLICY,
  MODULE_KEYS,
  planUpdate,
  type KnowledgeChangeType,
  type ModuleKey,
  type UpdatePlan,
  type UpdatePolicy,
} from "./plan-update";

/**
 * خدمة سياسات التحديث لكل موديول (الجزء السادس).
 *
 * ## البناء فوق الموجود
 *
 * اليوم فيه مفتاح عام واحد (`brain_settings.auto_resync_downstream`).
 * ده بيوسّعه لتحكّم **لكل موديول** عبر `knowledge_update_policies`.
 * المفتاح العام يفضل موجودًا كـ **افتراضي احتياطي**: لو موديول مالوش
 * صفّ سياسة، بنرجع للمفتاح العام (تلقائي/يدوي) بدل الافتراض الأعمى.
 *
 * الجدول غير موجود (٠٠٧٩ لسه مش مطبَّق)؟ بنرجع لخريطة فارغة — كل
 * الموديولات على الافتراضي، بلا فشل.
 */

const UNDEFINED_TABLE = "42P01";

/**
 * يقرأ سياسات المشروع كخريطة موديول → سياسة.
 * الموديول الغائب مش في الخريطة (المخطّط بيستخدم الافتراضي له).
 */
export async function getUpdatePolicies(
  projectId: string,
  client?: SupabaseClient
): Promise<Partial<Record<ModuleKey, UpdatePolicy>>> {
  const db = client ?? createServiceClient();

  const { data, error } = await db
    .from("knowledge_update_policies")
    .select("module_key, policy")
    .eq("project_id", projectId);

  if (error) {
    if (error.code !== UNDEFINED_TABLE) {
      console.error(`[UpdatePolicy] تعذّر قراءة السياسات: ${error.message}`);
    }
    return {};
  }

  const map: Partial<Record<ModuleKey, UpdatePolicy>> = {};
  for (const row of (data ?? []) as Array<{ module_key: string; policy: UpdatePolicy }>) {
    if ((MODULE_KEYS as readonly string[]).includes(row.module_key)) {
      map[row.module_key as ModuleKey] = row.policy;
    }
  }
  return map;
}

/**
 * يضبط سياسة موديول واحد (Upsert على مفتاح المشروع+الموديول).
 */
export async function setUpdatePolicy(
  projectId: string,
  moduleKey: ModuleKey,
  policy: UpdatePolicy,
  actorId?: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  if (!(MODULE_KEYS as readonly string[]).includes(moduleKey)) {
    return { ok: false, message: "موديول غير معروف." };
  }
  const db = client ?? createServiceClient();

  const { error } = await db.from("knowledge_update_policies").upsert(
    {
      project_id: projectId,
      module_key: moduleKey,
      policy,
      updated_by: actorId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,module_key" }
  );

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { ok: false, message: "جدول السياسات غير مطبَّق بعد (0079)." };
    }
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/**
 * الخطة الكاملة لمشروع: يقرأ السياسات ثم يبني خطة التحديث للدلتا.
 *
 * ده الباب اللي أي مسار تغيير معرفة بينادي بيه عشان يعرف: إيه أحدّثه
 * تلقائيًا، إيه أعرضه للموافقة، إيه أتخطّاه.
 */
export async function planIncrementalUpdate(
  projectId: string,
  changes: KnowledgeChangeType[],
  client?: SupabaseClient
): Promise<UpdatePlan> {
  const policies = await getUpdatePolicies(projectId, client);
  return planUpdate(changes, policies);
}

/**
 * السياسات كاملة للعرض — كل موديول مع سياسته الفعلية (شاملة الافتراضي).
 */
export async function listEffectivePolicies(
  projectId: string,
  client?: SupabaseClient
): Promise<Array<{ module: ModuleKey; policy: UpdatePolicy; isDefault: boolean }>> {
  const stored = await getUpdatePolicies(projectId, client);
  return MODULE_KEYS.map((module) => ({
    module,
    policy: stored[module] ?? DEFAULT_POLICY,
    isDefault: stored[module] === undefined,
  }));
}
