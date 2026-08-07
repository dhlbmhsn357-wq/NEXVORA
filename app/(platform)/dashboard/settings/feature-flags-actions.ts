"use server";

import { requireRole } from "@/lib/auth/rbac";
import { updateFeatureFlag } from "@/lib/feature-flags";
import { revalidatePath } from "next/cache";

/**
 * تحديث flag من واجهة الإعدادات — مسؤول النظام فقط.
 * أي flag يؤثر على مسار المنتج بالكامل، فالصلاحية owner-only هنا مقصودة.
 */
export async function updateFeatureFlagAction(
  name: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  const gate = await requireRole(["owner"]);
  if (!gate.ok) return { ok: false, message: "غير مخوّل — مسؤول النظام فقط." };

  const result = await updateFeatureFlag(name, {
    enabled_globally: enabled,
    updated_by: gate.userId ?? null,
  });

  if (!result.ok) return result;

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
