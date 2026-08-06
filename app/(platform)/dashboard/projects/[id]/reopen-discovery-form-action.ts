"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/rbac";

export async function reopenDiscoveryForm(
  formId: string,
  projectId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_forms")
    .update({ status: "draft" })
    .eq("id", formId);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
