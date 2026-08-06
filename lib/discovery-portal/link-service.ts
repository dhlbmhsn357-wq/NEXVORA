import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DiscoveryFormLink,
  DiscoveryFormTemplate,
  DiscoveryQuestion,
} from "@/lib/types/database";
import { getTemplateById, getTemplateQuestions } from "@/lib/discovery-templates/queries";
import { evaluateLinkState, type LinkAccessState } from "./token";

const LINK_COLUMNS =
  "id, project_id, lead_id, template_id, token, status, expires_at, opened_at, submitted_at, last_activity_at, created_by, created_at, updated_at, first_open_at, visit_count, last_country, last_device, last_browser, last_reminder_at, reminder_count, session_name, department, tags";

export async function getLinkByToken(
  supabase: SupabaseClient,
  token: string
): Promise<DiscoveryFormLink | null> {
  if (!token || typeof token !== "string") return null;
  const { data } = await supabase
    .from("discovery_form_links")
    .select(LINK_COLUMNS)
    .eq("token", token)
    .maybeSingle();
  return (data as DiscoveryFormLink) ?? null;
}

export interface UsableLinkOk {
  ok: true;
  link: DiscoveryFormLink;
}
export interface UsableLinkFail {
  ok: false;
  state: Exclude<LinkAccessState, "ok"> | "invalid";
}

/**
 * يحمّل رابطًا صالحًا للكتابة (مفتوح/قيد التعبئة). يرفض المنتهي/الملغى/
 * المُرسَل ويؤمّن أن انتهاء الوقت مأخوذ في الحسبان. لو الوقت انتهى،
 * يعلّم الحالة expired تلقائيًا (persist).
 */
export async function loadUsableLink(
  supabase: SupabaseClient,
  token: string,
  nowMs: number
): Promise<UsableLinkOk | UsableLinkFail> {
  const link = await getLinkByToken(supabase, token);
  if (!link) return { ok: false, state: "invalid" };

  const state = evaluateLinkState(link, nowMs);
  if (state !== "ok") {
    // لو انتهى الوقت ولسه العمود مش متحدّث، ثبّت الحالة.
    if (state === "expired" && link.status !== "expired") {
      await supabase
        .from("discovery_form_links")
        .update({ status: "expired" })
        .eq("id", link.id);
    }
    return { ok: false, state };
  }

  return { ok: true, link };
}

export interface PortalContext {
  projectName: string;
  /** رقم مرجعي قصير يُعرض للعميل (كود المشروع) — بلا أي معنى داخلي حسّاس. */
  referenceCode: string;
  companyName: string | null;
  contactName: string | null;
  template: DiscoveryFormTemplate | null;
  questions: DiscoveryQuestion[];
  answers: Record<string, unknown>;
}

/**
 * يجمّع بيانات عرض البوابة: اسم المشروع، الشركة، اسم جهة الاتصال (للترحيب)،
 * القالب وأسئلته، والإجابات المحفوظة (للاستئناف).
 */
export async function loadPortalContext(
  supabase: SupabaseClient,
  link: DiscoveryFormLink
): Promise<PortalContext> {
  const { data: project } = await supabase
    .from("projects")
    .select("name, project_code, client_id, lead_id, clients(company_name)")
    .eq("id", link.project_id)
    .maybeSingle();

  const companyName =
    project && project.clients
      ? Array.isArray(project.clients)
        ? project.clients[0]?.company_name ?? null
        : (project.clients as { company_name: string | null }).company_name
      : null;

  // اسم جهة الاتصال من الـ Lead (للترحيب الشخصي)
  let contactName: string | null = null;
  const leadId = link.lead_id ?? project?.lead_id ?? null;
  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("contact_id")
      .eq("id", leadId)
      .maybeSingle();
    if (lead?.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("full_name")
        .eq("id", lead.contact_id)
        .maybeSingle();
      contactName = contact?.full_name ?? null;
    }
  }

  // القالب: من الرابط أو من المشروع
  const templateId = link.template_id ?? null;
  const template = templateId ? await getTemplateById(supabase, templateId) : null;
  const questions = template ? await getTemplateQuestions(supabase, template.id) : [];

  // الإجابات المحفوظة — خاصة بهذه الجلسة (link_id)، مش المشروع كله
  const { data: form } = await supabase
    .from("discovery_forms")
    .select("answers")
    .eq("link_id", link.id)
    .maybeSingle();
  const answers = (form?.answers ?? {}) as Record<string, unknown>;

  return {
    projectName: project?.name ?? "مشروعك",
    referenceCode: project?.project_code ?? link.token.slice(0, 8).toUpperCase(),
    companyName,
    contactName,
    template,
    questions,
    answers,
  };
}

export type PortalPageResult =
  | { kind: "invalid" }
  | { kind: "cancelled" }
  | { kind: "expired" }
  | { kind: "misconfigured" }
  | { kind: "submitted"; projectName: string; referenceCode: string }
  | { kind: "ok"; context: PortalContext };

export interface PortalVisitMeta {
  userAgent?: string | null;
  country?: string | null;
}

/**
 * يحلّ صفحة البوابة بالكامل من الـ token: يقيّم الحالة، يثبّت الانتهاء،
 * يعلّم الفتح لأول مرة (+ سجل تدقيق)، ويرجّع ما يجب عرضه. كل منطق الوقت
 * والآثار الجانبية هنا (طبقة خدمة) عشان الصفحة تبقى pure.
 */
export async function resolvePortalPage(
  supabase: SupabaseClient,
  token: string,
  visit?: PortalVisitMeta
): Promise<PortalPageResult> {
  const link = await getLinkByToken(supabase, token);
  if (!link) return { kind: "invalid" };

  const now = Date.now();
  const state = evaluateLinkState(link, now);

  if (state === "cancelled") return { kind: "cancelled" };

  if (state === "expired") {
    if (link.status !== "expired") {
      await supabase.from("discovery_form_links").update({ status: "expired" }).eq("id", link.id);
    }
    return { kind: "expired" };
  }

  const context = await loadPortalContext(supabase, link);

  if (state === "submitted") {
    return { kind: "submitted", projectName: context.projectName, referenceCode: context.referenceCode };
  }

  if (!context.template || context.questions.length === 0) {
    return { kind: "misconfigured" };
  }

  // تعليم الرابط كـ "مفتوح" أول مرة + سجل تدقيق + إحصائيات الزيارة
  const nowIso = new Date(now).toISOString();
  const { parseUserAgent } = await import("./ua");
  const parsed = parseUserAgent(visit?.userAgent);

  const analyticsUpdate: Record<string, unknown> = {
    last_activity_at: nowIso,
    visit_count: (link.visit_count ?? 0) + 1,
    last_device: parsed.device,
    last_browser: parsed.browser,
  };
  if (visit?.country) analyticsUpdate.last_country = visit.country;
  if (!link.first_open_at) analyticsUpdate.first_open_at = nowIso;

  if (link.status === "pending") {
    analyticsUpdate.status = "opened";
    analyticsUpdate.opened_at = nowIso;
    await Promise.all([
      supabase.from("discovery_form_links").update(analyticsUpdate).eq("id", link.id),
      supabase.from("audit_log").insert({
        actor_id: null,
        entity_type: "discovery_link",
        entity_id: link.id,
        action: "update",
        changes: { event: "opened", project_id: link.project_id },
      }),
    ]);
  } else {
    // زيارات لاحقة — إحصائيات فقط بلا تغيير الحالة
    await supabase.from("discovery_form_links").update(analyticsUpdate).eq("id", link.id);
  }

  return { kind: "ok", context };
}
