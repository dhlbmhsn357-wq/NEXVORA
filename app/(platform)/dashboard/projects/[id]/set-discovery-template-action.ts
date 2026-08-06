"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * تغيير قالب الاكتشاف المرتبط بالمشروع يدويًا. لا يمسح أي إجابات محفوظة
 * (تغيير غير مدمِّر) — الـ Wizard يعيد التحميل بالقالب الجديد.
 */
export async function setProjectDiscoveryTemplate(
  projectId: string,
  templateId: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ discovery_template_id: templateId })
    .eq("id", projectId);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
