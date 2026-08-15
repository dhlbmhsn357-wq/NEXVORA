/**
 * تحويل Prospect → Lead — idempotent، يكتشف Lead/Contact موجود مسبقًا،
 * لا يُنشئ Client/Project تلقائيًا (فقط Lead، وClient/Contact المرتبطين
 * به إن لزم إنشاء Lead جديد بنفس ما يفعله new-lead-form.tsx بالضبط).
 * ==============================================================
 * new-lead-form.tsx هو مكوّن "use client" يستدعي supabase client مباشرة
 * (لا يوجد Server Action/Service قابل لإعادة الاستخدام من السيرفر لإنشاء
 * lead) — لذلك أُعيدت نفس الاستعلامات بالضبط هنا (clients → contacts →
 * leads insert)، بدل تكرار منطق مختلف. نمط الـ Idempotency (فحص موجود
 * قبل الإدخال + معالجة 23505) مطابق لـ convert-lead-action.ts.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateStatusTransition } from "./status-transitions";
import type { ProspectStatus } from "./types";

// ---------------------------------------------------------------------------
// Eligibility — Pure function
// ---------------------------------------------------------------------------
export interface ConversionEligibilityInput {
  status: ProspectStatus;
  organizationName: string;
  primaryPhoneNormalized: string | null;
  email: string | null;
  isOwnerOrAdmin: boolean;
  overrideReason?: string;
}

export interface ConversionEligibilityResult {
  ok: boolean;
  message?: string;
}

/**
 * تحقق: status === 'interested' OR (owner/admin + overrideReason)، واسم
 * صالح، ووسيلة تواصل صالحة واحدة على الأقل.
 */
export function validateProspectConversionEligibility(input: ConversionEligibilityInput): ConversionEligibilityResult {
  if (!input.organizationName || !input.organizationName.trim()) {
    return { ok: false, message: "لا يوجد اسم منظمة/جهة صالح للتحويل." };
  }
  if (!input.primaryPhoneNormalized && !input.email) {
    return { ok: false, message: "لا توجد وسيلة تواصل صالحة (هاتف أو بريد) للتحويل." };
  }
  if (input.status === "interested") return { ok: true };
  if (input.isOwnerOrAdmin && input.overrideReason && input.overrideReason.trim()) {
    return { ok: true };
  }
  return {
    ok: false,
    message: "لا يمكن تحويل جهة لم تُظهر اهتمامًا بعد (interested) إلا بصلاحية owner/admin مع سبب تحويل واضح.",
  };
}

// ---------------------------------------------------------------------------
// buildConversionNotes — Pure function
// ---------------------------------------------------------------------------
export interface ConversionNotesInput {
  organizationName: string;
  sector: string | null;
  governorate: string | null;
  cityOrArea: string | null;
  websiteUrl: string | null;
  painHypothesis: string | null;
  suggestedOffer: string | null;
  notes: string | null;
}

/** يدمج مرجع Prospect الأصلي + السياق البحثي في نص واحد منظم لـ leads.notes. */
export function buildConversionNotes(p: ConversionNotesInput): string {
  const lines: string[] = [`مصدر: قاعدة الاستهداف (Prospecting) — الجهة الأصلية: ${p.organizationName}`];
  if (p.sector) lines.push(`القطاع: ${p.sector}`);
  const location = [p.governorate, p.cityOrArea].filter(Boolean).join(" / ");
  if (location) lines.push(`الموقع: ${location}`);
  if (p.websiteUrl) lines.push(`الموقع الإلكتروني: ${p.websiteUrl}`);
  if (p.painHypothesis) lines.push(`فرضية المشكلة: ${p.painHypothesis}`);
  if (p.suggestedOffer) lines.push(`العرض المقترح: ${p.suggestedOffer}`);
  if (p.notes) lines.push(`ملاحظات إضافية: ${p.notes}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// checkExistingLeadMatch — read-only، لعرض Preview في UI (Part 2)
// ---------------------------------------------------------------------------
export interface ExistingLeadMatch {
  leadId: string;
  clientId: string | null;
  contactId: string;
  companyName: string | null;
  contactName: string | null;
  matchedBy: "phone" | "email";
}

export async function checkExistingLeadMatch(prospectId: string): Promise<ExistingLeadMatch | null> {
  const supabase = await createClient();
  const { data: prospect, error: prospectErr } = await supabase
    .from("prospects")
    .select("primary_phone_normalized, email")
    .eq("id", prospectId)
    .maybeSingle();
  if (prospectErr) throw prospectErr;
  if (!prospect) return null;

  let contactRow: { id: string; client_id: string | null; full_name: string | null } | null = null;
  let matchedBy: "phone" | "email" | null = null;

  if (prospect.primary_phone_normalized) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, client_id, full_name")
      .or(`phone.eq.${prospect.primary_phone_normalized},whatsapp.eq.${prospect.primary_phone_normalized}`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      contactRow = data;
      matchedBy = "phone";
    }
  }

  if (!contactRow && prospect.email) {
    const { data, error } = await supabase.from("contacts").select("id, client_id, full_name").eq("email", prospect.email).limit(1).maybeSingle();
    if (error) throw error;
    if (data) {
      contactRow = data;
      matchedBy = "email";
    }
  }

  if (!contactRow || !matchedBy) return null;

  const { data: lead, error: leadErr } = await supabase.from("leads").select("id, client_id").eq("contact_id", contactRow.id).maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return null;

  let companyName: string | null = null;
  if (contactRow.client_id) {
    const { data: client } = await supabase.from("clients").select("company_name").eq("id", contactRow.client_id).maybeSingle();
    companyName = (client?.company_name as string | undefined) ?? null;
  }

  return {
    leadId: lead.id as string,
    clientId: (lead.client_id as string | null) ?? null,
    contactId: contactRow.id,
    companyName,
    contactName: contactRow.full_name,
    matchedBy,
  };
}

// ---------------------------------------------------------------------------
// executeConversion — التنفيذ الفعلي (المرحلة الثانية)
// ---------------------------------------------------------------------------
export type ConversionOutcome =
  | { ok: true; action: "linked" | "created"; leadId: string }
  | { ok: false; message: string };

interface DbProspectFull {
  id: string;
  status: ProspectStatus;
  organization_name: string;
  sector: string | null;
  governorate: string | null;
  city_or_area: string | null;
  website_url: string | null;
  pain_hypothesis: string | null;
  suggested_offer: string | null;
  notes: string | null;
  primary_phone_normalized: string | null;
  email: string | null;
  converted_lead_id: string | null;
}

export interface ExecuteConversionOptions {
  overrideReason?: string;
  isOwnerOrAdmin?: boolean;
}

export async function executeConversion(
  prospectId: string,
  actorId: string | null,
  choice: "link" | "create",
  existingLeadId: string | undefined,
  options?: ExecuteConversionOptions
): Promise<ConversionOutcome> {
  const svc = createServiceClient();

  const { data: prospectData, error: fetchErr } = await svc.from("prospects").select("*").eq("id", prospectId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!prospectData) return { ok: false, message: "الجهة المستهدفة غير موجودة." };
  const prospect = prospectData as DbProspectFull;

  // Idempotency: لو اتحوّلت بالفعل، رجّع نفس الـ leadId بدل إنشاء جديد.
  if (prospect.converted_lead_id) {
    return { ok: true, action: "linked", leadId: prospect.converted_lead_id };
  }

  const eligibility = validateProspectConversionEligibility({
    status: prospect.status,
    organizationName: prospect.organization_name,
    primaryPhoneNormalized: prospect.primary_phone_normalized,
    email: prospect.email,
    isOwnerOrAdmin: !!options?.isOwnerOrAdmin,
    overrideReason: options?.overrideReason,
  });
  if (!eligibility.ok) return { ok: false, message: eligibility.message ?? "الجهة غير مؤهّلة للتحويل." };

  const transition = validateStatusTransition({
    currentStatus: prospect.status,
    targetStatus: "converted",
    hasConvertedLeadId: true, // سيتم ربطها بـLead في نفس هذه العملية
  });
  if (!transition.ok) return { ok: false, message: transition.message ?? "انتقال غير مسموح." };

  let leadId: string;
  let action: "linked" | "created";

  if (choice === "link") {
    if (!existingLeadId) return { ok: false, message: "لم يُحدَّد Lead للربط به." };
    leadId = existingLeadId;
    action = "linked";
  } else {
    // إعادة استخدام نفس تسلسل new-lead-form.tsx بالضبط: clients → contacts → leads
    // (لا Client/Project تلقائي — فقط الـ Lead ومرتبطاته).
    const { data: client, error: clientErr } = await svc
      .from("clients")
      .insert({ company_name: prospect.organization_name })
      .select("id")
      .single();
    if (clientErr || !client) return { ok: false, message: clientErr?.message ?? "فشل إنشاء العميل." };

    const { data: contact, error: contactErr } = await svc
      .from("contacts")
      .insert({
        client_id: client.id,
        full_name: prospect.organization_name,
        email: prospect.email,
        phone: prospect.primary_phone_normalized,
        whatsapp: prospect.primary_phone_normalized,
      })
      .select("id")
      .single();
    if (contactErr || !contact) return { ok: false, message: contactErr?.message ?? "فشل إنشاء جهة الاتصال." };

    const notes = buildConversionNotes({
      organizationName: prospect.organization_name,
      sector: prospect.sector,
      governorate: prospect.governorate,
      cityOrArea: prospect.city_or_area,
      websiteUrl: prospect.website_url,
      painHypothesis: prospect.pain_hypothesis,
      suggestedOffer: prospect.suggested_offer,
      notes: prospect.notes,
    });

    const { data: lead, error: leadErr } = await svc
      .from("leads")
      .insert({
        client_id: client.id,
        contact_id: contact.id,
        source: "Prospecting",
        owner_id: actorId,
        notes,
      })
      .select("id")
      .single();
    if (leadErr || !lead) return { ok: false, message: leadErr?.message ?? "فشل إنشاء الـLead." };

    leadId = lead.id;
    action = "created";
  }

  const { error: updateErr } = await svc
    .from("prospects")
    .update({ status: "converted", converted_lead_id: leadId, converted_at: new Date().toISOString() })
    .eq("id", prospectId);

  if (updateErr) {
    // Race Condition: طلب متزامن حوّل نفس الجهة قبلنا — رجّع النتيجة الفائزة بدل خطأ.
    if (updateErr.code === "23505") {
      const { data: raced } = await svc.from("prospects").select("converted_lead_id").eq("id", prospectId).maybeSingle();
      if (raced?.converted_lead_id) return { ok: true, action, leadId: raced.converted_lead_id };
    }
    return { ok: false, message: updateErr.message };
  }

  await svc.from("prospect_activities").insert({
    prospect_id: prospectId,
    activity_type: "converted_to_lead",
    previous_status: prospect.status,
    new_status: "converted",
    note: action === "linked" ? `تم الربط بـLead موجود (${leadId})` : `تم إنشاء Lead جديد (${leadId})`,
    created_by: actorId,
  });

  return { ok: true, action, leadId };
}

// ---------------------------------------------------------------------------
// convertProspectToLead — واجهة مختصرة: يفحص تلقائيًا وجود Lead مطابق
// ويختار link/create تلقائيًا. الـ UI (Part 2) اللي عايزة تعرض الخيارين
// على المستخدم قبل التنفيذ تستخدم checkExistingLeadMatch + executeConversion مباشرة.
// ---------------------------------------------------------------------------
export async function convertProspectToLead(
  prospectId: string,
  actorId: string | null,
  options?: ExecuteConversionOptions
): Promise<ConversionOutcome> {
  const match = await checkExistingLeadMatch(prospectId);
  if (match) {
    return executeConversion(prospectId, actorId, "link", match.leadId, options);
  }
  return executeConversion(prospectId, actorId, "create", undefined, options);
}
