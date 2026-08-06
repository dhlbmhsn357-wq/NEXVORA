import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { WhatsAppService } from "./service";
import { sendDiscoveryLinkOverWhatsApp } from "./communication-service";
import { evaluateLinkState } from "@/lib/discovery-portal/token";

interface ReminderCandidate {
  project_id: string;
  status: string;
  created_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  expires_at: string | null;
  contact_whatsapp: string | null;
  contact_phone: string | null;
}

/**
 * القاعدة:
 *  - الرابط لسه صالح (ok/opened/in_progress) — مش submitted/expired/cancelled.
 *  - لسه ما وصلش الحد الأقصى للتذكيرات في الإعدادات.
 *  - مرت مدة الفاصل بين آخر رسالة/تذكير والوقت الحالي.
 *  - عند جهة الاتصال رقم واتس صالح.
 */
export async function runReminderSweep(
  publicBaseUrl: string,
  supabaseOverride?: SupabaseClient
): Promise<{ sent: number; skipped: number; errors: number }> {
  const supabase = supabaseOverride ?? createServiceClient();
  const settings = await WhatsAppService.getSettings(supabase);

  if (!settings.reminders_enabled) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const nowMs = Date.now();
  const intervalMs = settings.reminder_interval_hours * 3600 * 1000;

  const { data: links } = await supabase
    .from("discovery_form_links")
    .select(
      "id, project_id, status, expires_at, opened_at, submitted_at, last_reminder_at, reminder_count, created_at, projects:project_id(lead_id)"
    )
    .in("status", ["pending", "opened", "in_progress"]);

  const rows = (links ?? []) as Array<{
    id: string;
    project_id: string;
    status: string;
    expires_at: string | null;
    opened_at: string | null;
    submitted_at: string | null;
    last_reminder_at: string | null;
    reminder_count: number;
    created_at: string;
    projects: { lead_id: string | null } | { lead_id: string | null }[] | null;
  }>;

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const link of rows) {
    // فحص الانتهاء
    const state = evaluateLinkState(
      { status: link.status as "pending", expires_at: link.expires_at },
      nowMs
    );
    if (state !== "ok") {
      skipped++;
      continue;
    }
    if ((link.reminder_count ?? 0) >= settings.reminder_max_count) {
      skipped++;
      continue;
    }

    // الفاصل من أحدث نشاط (رسالة أو تذكير) أو من الإنشاء
    const lastActivityMs = (() => {
      const dates = [link.last_reminder_at, link.created_at]
        .filter(Boolean)
        .map((d) => new Date(d as string).getTime());
      return dates.length ? Math.max(...dates) : 0;
    })();
    if (nowMs - lastActivityMs < intervalMs) {
      skipped++;
      continue;
    }

    // تحقّق من وجود جهة اتصال ورقم
    const leadRel = link.projects;
    const leadId = Array.isArray(leadRel) ? leadRel[0]?.lead_id : leadRel?.lead_id;
    if (!leadId) {
      skipped++;
      continue;
    }
    const { data: lead } = await supabase
      .from("leads")
      .select("contact_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead?.contact_id) {
      skipped++;
      continue;
    }
    const { data: contact } = await supabase
      .from("contacts")
      .select("whatsapp, phone")
      .eq("id", lead.contact_id)
      .maybeSingle();
    if (!contact?.whatsapp?.trim() && !contact?.phone?.trim()) {
      skipped++;
      continue;
    }

    const reminderIndex = (link.reminder_count ?? 0) + 1;
    const result = await sendDiscoveryLinkOverWhatsApp({
      projectId: link.project_id,
      actorId: null,
      reminderIndex,
      publicBaseUrl,
    });

    if (result.ok) sent++;
    else errors++;
  }

  return { sent, skipped, errors };
}

// نُصدِّرها كذلك مع نوع اسم ضمن CandidateForType — للاستخدام في اختبارات لاحقة إن لزم.
export type { ReminderCandidate };
