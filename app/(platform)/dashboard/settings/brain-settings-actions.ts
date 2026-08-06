"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/rbac";
import { updateBrainSettings } from "@/lib/brain-v2/review-service";

export async function updateBrainSettingsAction(input: {
  confidence_threshold_percent: number;
  auto_resync_downstream?: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };
  const r = await updateBrainSettings({
    confidence_threshold_percent: input.confidence_threshold_percent,
    auto_resync_downstream: input.auto_resync_downstream,
    actorId: auth.userId ?? null,
  });
  if (!r.ok) return { ok: false, message: r.message ?? "فشل الحفظ." };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
