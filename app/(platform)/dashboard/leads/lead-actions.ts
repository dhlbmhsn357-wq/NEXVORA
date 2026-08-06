"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import type { LeadStatus } from "@/lib/types/database";

/**
 * تعديل بيانات العميل المحتمل — Owner/Admin/Supervisor فقط (المنفّذ لأ،
 * لأن أقل رتبة مسموحة supervisor). بيانات الشركة/المسؤول بتتحدّث في
 * clients/contacts، وبيانات الـ lead في leads. بنحفظ لقطة في
 * lead_versions + سجل في audit_log قبل التعديل، ونضبط updated_by.
 */

type Result = { ok: boolean; message?: string };

const EDIT_ROLES = ["owner", "admin", "supervisor"] as const;

export interface LeadEditInput {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  whatsapp: string;
  source: string;
  notes: string;
  status: LeadStatus;
}

export interface LeadEditData extends LeadEditInput {
  leadId: string;
}

/** يحمّل القيم الحالية للتعديل (شركة/مسؤول/lead). */
export async function getLeadForEdit(leadId: string): Promise<{ ok: boolean; data?: LeadEditData; message?: string }> {
  const auth = await requireRole([...EDIT_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const service = createServiceClient();
  const { data: lead } = await service
    .from("leads")
    .select("id, client_id, contact_id, source, notes, status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, message: "العميل المحتمل غير موجود." };

  const [{ data: client }, { data: contact }] = await Promise.all([
    lead.client_id ? service.from("clients").select("company_name").eq("id", lead.client_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.contact_id ? service.from("contacts").select("full_name, email, phone, whatsapp").eq("id", lead.contact_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return {
    ok: true,
    data: {
      leadId: lead.id as string,
      companyName: (client?.company_name as string) ?? "",
      contactName: (contact?.full_name as string) ?? "",
      email: (contact?.email as string) ?? "",
      phone: (contact?.phone as string) ?? "",
      whatsapp: (contact?.whatsapp as string) ?? "",
      source: (lead.source as string) ?? "",
      notes: (lead.notes as string) ?? "",
      status: lead.status as LeadStatus,
    },
  };
}

export async function updateLead(leadId: string, input: LeadEditInput): Promise<Result> {
  const auth = await requireRole([...EDIT_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };

  // Validation
  if (!input.companyName.trim()) return { ok: false, message: "اسم الشركة مطلوب." };
  if (!input.contactName.trim()) return { ok: false, message: "اسم المسؤول مطلوب." };
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return { ok: false, message: "أدخل بريدًا صالحًا." };
  }
  const validStatuses: LeadStatus[] = ["new", "contacted", "qualified", "converted", "lost"];
  if (!validStatuses.includes(input.status)) return { ok: false, message: "حالة غير صالحة." };

  const service = createServiceClient();
  const { data: lead } = await service
    .from("leads")
    .select("id, client_id, contact_id, source, notes, status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, message: "العميل المحتمل غير موجود." };

  // لقطة قبل التعديل (للـ history)
  const before = await getLeadForEdit(leadId);
  const { count } = await service
    .from("lead_versions")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);
  await service.from("lead_versions").insert({
    lead_id: leadId,
    version: (count ?? 0) + 1,
    snapshot: before.data ?? {},
    change_reason: "edit",
    changed_by: auth.userId ?? null,
  });

  // تحديث الشركة
  if (lead.client_id) {
    await service.from("clients").update({ company_name: input.companyName.trim() }).eq("id", lead.client_id);
  }
  // تحديث المسؤول
  if (lead.contact_id) {
    await service.from("contacts").update({
      full_name: input.contactName.trim(),
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      whatsapp: input.whatsapp.trim() || null,
    }).eq("id", lead.contact_id);
  }
  // تحديث الـ lead نفسه
  const { error } = await service
    .from("leads")
    .update({ source: input.source.trim() || null, notes: input.notes.trim() || null, status: input.status, updated_by: auth.userId ?? null })
    .eq("id", leadId);
  if (error) return { ok: false, message: error.message };

  // Audit
  await service.from("audit_log").insert({
    actor_id: auth.userId ?? null,
    entity_type: "lead",
    entity_id: leadId,
    action: "update",
    changes: { before: before.data ?? null, after: input },
  });

  revalidatePath("/dashboard/leads");
  return { ok: true };
}
