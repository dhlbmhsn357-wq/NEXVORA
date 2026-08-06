import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { WhatsAppService } from "./service";
import {
  renderTemplate,
  getDefaultTemplateForPurpose,
  type TemplateVars,
} from "./templates";
import { normalizePhone, waMeLink } from "./phone";
import {
  generateDiscoveryToken,
  computeExpiresAt,
  evaluateLinkState,
} from "@/lib/discovery-portal/token";
import { getDefaultTemplate, getTemplateQuestions } from "@/lib/discovery-templates/queries";
import { formatEstimatedTimeLine } from "@/lib/discovery-templates/estimated-time";
import type {
  WhatsAppMessagePurpose,
  DiscoveryFormLink,
} from "@/lib/types/database";

export interface CommunicationContextResult {
  projectName: string;
  companyName: string | null;
  contact: { id: string; full_name: string; whatsapp: string | null; phone: string | null } | null;
  leadId: string | null;
  link: DiscoveryFormLink;
}

/**
 * يضمن وجود رابط اكتشاف صالح للمشروع:
 *  - لو مفيش → ينشئ واحد جديد.
 *  - لو موجود وحالته ok → يعيد استخدامه.
 *  - لو منتهي أو ملغى → يولّد رابطًا جديدًا (دورة).
 * لا يمسّ روابط submitted (يعيد استخدامها زي ما هي — الرسالة هتكون "شكر").
 */
export async function ensureDiscoveryLink(
  supabase: SupabaseClient,
  projectId: string,
  actorId: string | null,
  expirationDays: number | null
): Promise<{ link: DiscoveryFormLink; regenerated: boolean } | { error: string }> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, lead_id, discovery_template_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { error: "المشروع غير موجود." };

  let templateId = project.discovery_template_id as string | null;
  if (!templateId) {
    const def = await getDefaultTemplate(supabase);
    templateId = def?.id ?? null;
  }
  if (!templateId) return { error: "حدّد قالب اكتشاف للمشروع أولاً." };

  // Discovery Workspace: مشروع ممكن يبقى عنده جلسات متعددة. للواتساب
  // بنستهدف أحدث جلسة نشطة كـ "primary"، أو ننشئ واحدة جديدة لو مفيش.
  const { data: existing } = await supabase
    .from("discovery_form_links")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const state = existing ? evaluateLinkState(existing as DiscoveryFormLink, now) : "invalid";

  if (existing && (state === "ok" || state === "submitted")) {
    return { link: existing as DiscoveryFormLink, regenerated: false };
  }

  const token = generateDiscoveryToken();
  const expires_at = computeExpiresAt(expirationDays, now);
  const linkRow = {
    project_id: projectId,
    lead_id: project.lead_id ?? null,
    template_id: templateId,
    token,
    status: "pending" as const,
    expires_at,
    opened_at: null,
    submitted_at: null,
    last_activity_at: null,
    first_open_at: null,
    visit_count: 0,
    last_country: null,
    last_device: null,
    last_browser: null,
    last_reminder_at: null,
    reminder_count: 0,
    created_by: actorId,
  };

  // find-then-update/insert بدل upsert onConflict (القيد الفريد على
  // project_id اتشال في 0057). لو فيه جلسة (منتهية/ملغاة) نجدّدها، وإلا ننشئ.
  const { data: upserted, error } = existing
    ? await supabase.from("discovery_form_links").update(linkRow).eq("id", (existing as { id: string }).id).select("*").single()
    : await supabase.from("discovery_form_links").insert({ ...linkRow, session_name: "الاكتشاف العام" }).select("*").single();

  if (error || !upserted) {
    return { error: error?.message ?? "تعذّر إنشاء الرابط." };
  }

  await supabase.from("audit_log").insert({
    actor_id: actorId,
    entity_type: "discovery_link",
    entity_id: (upserted as { id: string }).id,
    action: existing ? "update" : "create",
    changes: { event: existing ? "regenerated_for_whatsapp" : "generated_for_whatsapp", project_id: projectId },
  });

  return { link: upserted as DiscoveryFormLink, regenerated: !!existing };
}

/**
 * يجمّع بيانات جهة الاتصال + المشروع لبناء متغيّرات القالب.
 * جهة الاتصال بتيجي من الـ Lead (المصدر الرسمي لرقم الواتس).
 */
export async function loadCommunicationContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<{
  projectName: string;
  companyName: string | null;
  leadId: string | null;
  contact: { id: string; full_name: string; whatsapp: string | null; phone: string | null } | null;
} | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("name, lead_id, clients(company_name)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const companyName =
    Array.isArray(project.clients)
      ? project.clients[0]?.company_name ?? null
      : (project.clients as { company_name: string | null } | null)?.company_name ?? null;

  let contact: {
    id: string;
    full_name: string;
    whatsapp: string | null;
    phone: string | null;
  } | null = null;

  if (project.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("contact_id")
      .eq("id", project.lead_id)
      .maybeSingle();
    if (lead?.contact_id) {
      const { data: c } = await supabase
        .from("contacts")
        .select("id, full_name, whatsapp, phone")
        .eq("id", lead.contact_id)
        .maybeSingle();
      contact = (c as typeof contact) ?? null;
    }
  }

  return {
    projectName: project.name,
    companyName,
    leadId: project.lead_id ?? null,
    contact,
  };
}

/**
 * يبني قيم المتغيّرات النهائية للقالب بناءً على السياق + رابط الاكتشاف.
 */
export function buildTemplateVars(input: {
  contactName: string | null;
  projectName: string;
  companyName: string | null;
  link: DiscoveryFormLink;
  publicBaseUrl: string;
  /** عدد أسئلة القالب — لحساب estimated_time_line بنفس صيغة صفحة الفورم بالظبط. */
  questionCount?: number;
}): TemplateVars {
  const url = `${input.publicBaseUrl.replace(/\/+$/, "")}/discovery/${input.link.token}`;
  const expDate = input.link.expires_at
    ? new Date(input.link.expires_at).toLocaleDateString("ar-EG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  return {
    customer_name: input.contactName?.trim() || "عميلنا العزيز",
    project_name: input.projectName,
    company_name: input.companyName ?? "",
    discovery_link: url,
    expiration_date: expDate,
    expiration_line: expDate ? `الرابط صالح حتى ${expDate}.` : "الرابط بلا انتهاء.",
    estimated_time_line:
      input.questionCount && input.questionCount > 0
        ? formatEstimatedTimeLine(input.questionCount)
        : "بيستغرق دقايق معدودة",
  };
}

export interface PrepareManualInput {
  projectId: string;
  actorId?: string | null;
  /** يبطل استخدام التذكيرات (0 = رسالة أولى). */
  reminderIndex?: number;
  overridePurpose?: WhatsAppMessagePurpose;
  publicBaseUrl: string;
}

export type PrepareManualOutcome =
  | { ok: true; waUrl: string; regenerated: boolean; purpose: WhatsAppMessagePurpose }
  | { ok: false; message: string };

/**
 * المسار اليدوي (بدون Provider/API خارجي): يجهّز رابط الاكتشاف + الرسالة
 * النهائية، يسجّلها في whatsapp_messages (provider="manual", status="sent"
 * بشكل تفاؤلي فور فتح واتساب — مفيش تأكيد تسليم فعلي في المسار ده)، ويرجّع
 * رابط wa.me جاهز بالنص عشان يُفتح في تبويب جديد ويضغط المستخدم "إرسال" بنفسه.
 */
export async function prepareManualWhatsAppMessage(
  input: PrepareManualInput
): Promise<PrepareManualOutcome> {
  const supabase = createServiceClient();
  const settings = await WhatsAppService.getSettings(supabase);

  const linkResult = await ensureDiscoveryLink(
    supabase,
    input.projectId,
    input.actorId ?? null,
    settings.default_link_expiration_days
  );
  if ("error" in linkResult) return { ok: false, message: linkResult.error };
  const { link, regenerated } = linkResult;

  const ctx = await loadCommunicationContext(supabase, input.projectId);
  if (!ctx) return { ok: false, message: "المشروع غير موجود." };
  if (!ctx.contact?.whatsapp && !ctx.contact?.phone) {
    return { ok: false, message: "لا يوجد رقم واتساب لجهة الاتصال." };
  }

  const purpose = pickPurpose(link, input.reminderIndex ?? 0, input.overridePurpose);
  const template = await getDefaultTemplateForPurpose(supabase, purpose);
  if (!template) return { ok: false, message: `لا يوجد قالب مفعّل للغرض: ${purpose}` };

  const questions = link.template_id ? await getTemplateQuestions(supabase, link.template_id) : [];

  const vars = buildTemplateVars({
    contactName: ctx.contact?.full_name ?? null,
    projectName: ctx.projectName,
    companyName: ctx.companyName,
    link,
    publicBaseUrl: input.publicBaseUrl,
    questionCount: questions.length,
  });
  const body = renderTemplate(template.body, vars);

  const rawPhone = ctx.contact?.whatsapp ?? ctx.contact?.phone ?? "";
  const phone = normalizePhone(rawPhone, settings.default_country);
  if (!phone.ok) return { ok: false, message: `رقم غير صالح: ${phone.reason}` };

  const nowIso = new Date().toISOString();
  const { data: created, error: insertErr } = await supabase
    .from("whatsapp_messages")
    .insert({
      project_id: input.projectId,
      lead_id: ctx.leadId,
      contact_id: ctx.contact?.id ?? null,
      link_id: link.id,
      direction: "outbound",
      phone: phone.e164,
      purpose,
      template_key: template.key,
      body,
      reminder_index: input.reminderIndex ?? 0,
      provider: "manual",
      status: "sent",
      sent_at: nowIso,
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    return { ok: false, message: insertErr?.message ?? "تعذّر تسجيل الرسالة." };
  }

  await supabase.from("audit_log").insert({
    actor_id: input.actorId ?? null,
    entity_type: "whatsapp_message",
    entity_id: created.id,
    action: "create",
    changes: { event: "manual_send_prepared", purpose, project_id: input.projectId },
  });

  if ((input.reminderIndex ?? 0) > 0) {
    await supabase
      .from("discovery_form_links")
      .update({ last_reminder_at: nowIso, reminder_count: (link.reminder_count ?? 0) + 1 })
      .eq("id", link.id);
  }

  return { ok: true, waUrl: waMeLink(phone.e164, body), regenerated, purpose };
}

export interface SendDiscoveryInput {
  projectId: string;
  actorId?: string | null;
  /** يبطل استخدام التذكيرات (0 = رسالة أولى). */
  reminderIndex?: number;
  /** طلب صريح لإجبار غرض معيّن (وإلا يُحدَّد تلقائيًا حسب حالة الرابط). */
  overridePurpose?: WhatsAppMessagePurpose;
  publicBaseUrl: string;
}

export type SendDiscoveryOutcome =
  | { ok: true; message_id: string; regenerated: boolean; purpose: WhatsAppMessagePurpose }
  | { ok: false; message: string; code?: string };

/**
 * الغرض المناسب حسب حالة الرابط. Reminder → قبل الفتح إذا لم يُفتح،
 * قبل الإكمال إذا فُتِح ولم يُسلَّم. Manual invitation = discovery_invitation.
 */
function pickPurpose(
  link: DiscoveryFormLink,
  reminderIndex: number,
  override?: WhatsAppMessagePurpose
): WhatsAppMessagePurpose {
  if (override) return override;
  // رابط مُسلَّم بالفعل — أي رسالة عليه لازم تكون "شكر"، مش دعوة تعبئة
  // فيها الرابط نفسه (العميل خلص أصلاً). له أولوية فوق منطق التذكيرات.
  if (link.status === "submitted") return "thank_you";
  if (reminderIndex > 0) {
    if (link.status === "opened" || link.status === "in_progress") {
      return "reminder_before_completion";
    }
    return "reminder_before_open";
  }
  return "discovery_invitation";
}

/**
 * الـ orchestrator الرئيسي — يستخدمه الـ server actions والـ reminder engine.
 * الخطوات:
 *   1. ضمان رابط اكتشاف صالح (reuse/regen).
 *   2. جمع سياق (contact + template + vars).
 *   3. تحقّق رقم الهاتف.
 *   4. إنشاء صف whatsapp_messages بحالة queued.
 *   5. Dispatch via WhatsAppService (retry داخلي).
 *   6. تحديث الصف بالنتيجة النهائية.
 */
export async function sendDiscoveryLinkOverWhatsApp(
  input: SendDiscoveryInput
): Promise<SendDiscoveryOutcome> {
  const supabase = createServiceClient();
  const settings = await WhatsAppService.getSettings(supabase);

  const linkResult = await ensureDiscoveryLink(
    supabase,
    input.projectId,
    input.actorId ?? null,
    settings.default_link_expiration_days
  );
  if ("error" in linkResult) return { ok: false, message: linkResult.error };
  const { link, regenerated } = linkResult;

  const ctx = await loadCommunicationContext(supabase, input.projectId);
  if (!ctx) return { ok: false, message: "المشروع غير موجود." };
  if (!ctx.contact?.whatsapp && !ctx.contact?.phone) {
    return { ok: false, message: "لا يوجد رقم واتساب لجهة الاتصال." };
  }

  const purpose = pickPurpose(link, input.reminderIndex ?? 0, input.overridePurpose);
  const template = await getDefaultTemplateForPurpose(supabase, purpose);
  if (!template) return { ok: false, message: `لا يوجد قالب مفعّل للغرض: ${purpose}` };

  const questions = link.template_id ? await getTemplateQuestions(supabase, link.template_id) : [];

  const vars = buildTemplateVars({
    contactName: ctx.contact?.full_name ?? null,
    projectName: ctx.projectName,
    companyName: ctx.companyName,
    link,
    publicBaseUrl: input.publicBaseUrl,
    questionCount: questions.length,
  });
  const body = renderTemplate(template.body, vars);

  const rawPhone = ctx.contact?.whatsapp ?? ctx.contact?.phone ?? "";
  const phone = normalizePhone(rawPhone, settings.default_country);
  if (!phone.ok) return { ok: false, message: `رقم غير صالح: ${phone.reason}` };

  // 1) أنشئ صف الرسالة أولاً (queued) للربط مع provider_message_id
  const { data: created, error: insertErr } = await supabase
    .from("whatsapp_messages")
    .insert({
      project_id: input.projectId,
      lead_id: ctx.leadId,
      contact_id: ctx.contact?.id ?? null,
      link_id: link.id,
      direction: "outbound",
      phone: phone.e164,
      purpose,
      template_key: template.key,
      body,
      reminder_index: input.reminderIndex ?? 0,
      provider: settings.provider,
      status: "queued",
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    return { ok: false, message: insertErr?.message ?? "تعذّر تسجيل الرسالة." };
  }

  // 2) Dispatch (retry داخلي في WhatsAppService)
  const response = await WhatsAppService.dispatch({
    request: { to: phone.e164, body, purpose },
    actorId: input.actorId ?? null,
    projectId: input.projectId,
    messageId: created.id,
  });

  const nowIso = new Date().toISOString();
  if (response.success) {
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "sent",
        provider_message_id: response.provider_message_id,
        sent_at: nowIso,
      })
      .eq("id", created.id);
  } else {
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "failed",
        failed_at: nowIso,
        error_code: response.error?.code ?? "UNKNOWN",
        error_message: response.error?.message ?? "فشل الإرسال.",
      })
      .eq("id", created.id);
  }

  // تسجيل audit
  await supabase.from("audit_log").insert({
    actor_id: input.actorId ?? null,
    entity_type: "whatsapp_message",
    entity_id: created.id,
    action: "create",
    changes: {
      event: response.success ? "sent" : "failed",
      purpose,
      project_id: input.projectId,
      provider: settings.provider,
    },
  });

  // لو تذكير، نحدّث عداد الرابط
  if ((input.reminderIndex ?? 0) > 0) {
    await supabase
      .from("discovery_form_links")
      .update({ last_reminder_at: nowIso, reminder_count: (link.reminder_count ?? 0) + 1 })
      .eq("id", link.id);
  }

  return response.success
    ? { ok: true, message_id: created.id, regenerated, purpose }
    : {
        ok: false,
        message: response.error?.message ?? "فشل إرسال الرسالة.",
        code: response.error?.code,
      };
}
