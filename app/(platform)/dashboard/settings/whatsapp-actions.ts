"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/rbac";
import { WhatsAppService } from "@/lib/whatsapp/service";
import type {
  WhatsAppProviderName,
  WhatsAppMessagePurpose,
} from "@/lib/types/database";

type Result = { ok: boolean; message?: string };

export interface WhatsAppSettingsPatch {
  provider?: WhatsAppProviderName;
  default_country?: string;
  default_link_expiration_days?: number | null;
  reminders_enabled?: boolean;
  reminder_max_count?: number;
  reminder_interval_hours?: number;
}

export async function updateWhatsAppSettings(patch: WhatsAppSettingsPatch): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const update: Record<string, unknown> = { ...patch, updated_by: auth.userId ?? null };
  const { error } = await supabase
    .from("whatsapp_settings")
    .update(update)
    .eq("scope", "global");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function updateWhatsAppTemplate(
  templateId: string,
  patch: { name?: string; body?: string; status?: "active" | "inactive" }
): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const clean: Record<string, unknown> = { updated_by: auth.userId ?? null };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, message: "الاسم مطلوب." };
    clean.name = patch.name.trim();
  }
  if (patch.body !== undefined) {
    if (!patch.body.trim()) return { ok: false, message: "نص القالب مطلوب." };
    clean.body = patch.body;
  }
  if (patch.status !== undefined) clean.status = patch.status;

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_templates")
    .update(clean)
    .eq("id", templateId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function createWhatsAppTemplate(input: {
  name: string;
  purpose: WhatsAppMessagePurpose;
  body: string;
}): Promise<Result & { id?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!input.name.trim() || !input.body.trim()) {
    return { ok: false, message: "الاسم والنص مطلوبان." };
  }
  const supabase = await createClient();
  const key = `${input.purpose}_${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .insert({
      key,
      name: input.name.trim(),
      purpose: input.purpose,
      body: input.body,
      is_default: false,
      status: "active",
      updated_by: auth.userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true, id: data?.id };
}

export async function testWhatsAppProvider(
  providerName: WhatsAppProviderName
): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  const result = await WhatsAppService.healthCheck(providerName);
  revalidatePath("/dashboard/settings");
  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message };
}
