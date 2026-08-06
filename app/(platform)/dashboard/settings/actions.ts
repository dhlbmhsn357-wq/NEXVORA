"use server";

import { createClient } from "@/lib/supabase/server";
import { AIService } from "@/lib/ai/service";
import { AIProviderName, AITaskType } from "@/lib/ai/types";
import { requireAdmin } from "@/lib/auth/rbac";

export async function testConnection(providerName: AIProviderName) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const result = await AIService.healthCheck(providerName);
  const supabase = await createClient();

  await supabase.from("ai_provider_status").upsert({
    provider: providerName,
    last_check_at: new Date().toISOString(),
    last_check_ok: result.ok,
    last_message: result.message,
  });

  return result;
}

const VALID_PROVIDERS = new Set<string>(Object.values(AIProviderName));

export async function updateTaskModel(taskType: AITaskType, model: string, provider?: string) {
  if (!model.trim()) {
    return { ok: false, message: "اسم الموديل مطلوب." };
  }
  if (provider !== undefined && !VALID_PROVIDERS.has(provider)) {
    return { ok: false, message: "مزوّد غير معروف." };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();

  const patch: { model: string; updated_at: string; updated_by: string | null; provider?: string } = {
    model: model.trim(),
    updated_at: new Date().toISOString(),
    updated_by: auth.userId ?? null,
  };
  if (provider !== undefined) patch.provider = provider;

  const { error } = await supabase
    .from("ai_task_model_config")
    .update(patch)
    .eq("task_type", taskType);

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "تم الحفظ." };
}
