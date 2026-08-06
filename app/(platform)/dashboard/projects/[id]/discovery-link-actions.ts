"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/rbac";
import { createSession, deleteSession, fetchSessionResponses } from "@/lib/discovery-portal/session-service";
import {
  generateDiscoveryToken,
  computeExpiresAt,
  EXPIRATION_OPTIONS,
  parseCustomExpirationHours,
} from "@/lib/discovery-portal/token";

type LinkResult = { ok: boolean; message?: string; token?: string };

function expiresFromValue(value: string): string | null {
  const customHours = parseCustomExpirationHours(value);
  if (customHours !== null) return computeExpiresAt(customHours / 24, Date.now());
  const opt = EXPIRATION_OPTIONS.find((o) => o.value === value);
  return computeExpiresAt(opt ? opt.days : 7, Date.now());
}

function daysFromValue(value: string): number | null {
  const customHours = parseCustomExpirationHours(value);
  if (customHours !== null) return customHours / 24;
  const opt = EXPIRATION_OPTIONS.find((o) => o.value === value);
  return opt ? opt.days : 7;
}

async function projectIdOfLink(supabase: Awaited<ReturnType<typeof createClient>>, linkId: string): Promise<string | null> {
  const { data } = await supabase.from("discovery_form_links").select("project_id").eq("id", linkId).maybeSingle();
  return (data?.project_id as string | undefined) ?? null;
}

/**
 * إنشاء جلسة اكتشاف جديدة (Discovery Workspace) — **لا يستبدل** أي جلسة
 * سابقة، كل جلسة لها رابط عام دائم خاص بها.
 */
export async function createDiscoverySession(
  projectId: string,
  input: { templateId: string; sessionName: string; department?: string; expirationValue: string }
): Promise<LinkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!input.templateId) return { ok: false, message: "اختر قالبًا للجلسة." };

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("lead_id").eq("id", projectId).maybeSingle();

  const result = await createSession(supabase, {
    projectId,
    templateId: input.templateId,
    sessionName: input.sessionName,
    department: input.department ?? null,
    leadId: (project?.lead_id as string | null) ?? null,
    expiresInDays: daysFromValue(input.expirationValue),
    actorId: auth.userId ?? null,
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return result.ok ? { ok: true, token: result.token } : { ok: false, message: result.message };
}

export interface SessionResponseItem {
  key: string;
  label: string;
  category: string | null;
  answer: unknown;
  answered: boolean;
}
export interface SessionResponses {
  ok: boolean;
  message?: string;
  sessionName: string | null;
  status: string | null;
  submittedAt: string | null;
  answeredCount: number;
  totalCount: number;
  items: SessionResponseItem[];
}

/**
 * يجيب إجابات جلسة اكتشاف للعرض داخل المنصة — يقرن كل سؤال (من الـ
 * snapshot المحفوظ وقت التعبئة، وإلا من أسئلة القالب) بإجابة العميل.
 * مرتّبة بترتيب الأسئلة، مع تجميع اختياري حسب القسم في الواجهة.
 */
export async function getSessionResponses(linkId: string): Promise<SessionResponses> {
  const empty: SessionResponses = {
    ok: false,
    sessionName: null,
    status: null,
    submittedAt: null,
    answeredCount: 0,
    totalCount: 0,
    items: [],
  };

  const auth = await requireAdmin();
  if (!auth.ok) return { ...empty, message: auth.message };

  const supabase = await createClient();
  const data = await fetchSessionResponses(supabase, linkId);
  if (!data.found) return { ...empty, message: "الجلسة غير موجودة." };

  return {
    ok: true,
    sessionName: data.sessionName,
    status: data.status,
    submittedAt: data.submittedAt,
    answeredCount: data.answeredCount,
    totalCount: data.totalCount,
    items: data.items,
  };
}

/** حذف جلسة نهائيًا (يدوي فقط) — لا يؤثر على أي جلسة تانية. */
export async function deleteDiscoverySession(linkId: string): Promise<LinkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const projectId = await projectIdOfLink(supabase, linkId);
  const result = await deleteSession(supabase, linkId, auth.userId ?? null);
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

/** إعادة توليد رابط جلسة — token جديد آمن، يصفّر الحالة والانتهاء. */
export async function regenerateSessionLink(linkId: string, expirationValue: string): Promise<LinkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const projectId = await projectIdOfLink(supabase, linkId);
  const token = generateDiscoveryToken();
  const { error } = await supabase
    .from("discovery_form_links")
    .update({
      token,
      status: "pending",
      expires_at: expiresFromValue(expirationValue),
      opened_at: null,
      submitted_at: null,
      last_activity_at: null,
      first_open_at: null,
      visit_count: 0,
    })
    .eq("id", linkId);
  if (error) return { ok: false, message: error.message };

  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, token };
}

/**
 * تجديد/تغيير مدة انتهاء رابط جلسة — **نفس الرابط والـ token** (بدون
 * توليد رابط جديد). لو منتهيًا وامتدّ يرجع pending. بيسجّل العملية في
 * audit_log (event: link_renewed) مع القيمة القديمة والجديدة.
 */
export async function changeSessionExpiration(linkId: string, expirationValue: string): Promise<LinkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data: link } = await supabase
    .from("discovery_form_links")
    .select("project_id, status, expires_at")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, message: "الجلسة غير موجودة." };

  const newExpiresAt = expiresFromValue(expirationValue);
  const update: Record<string, unknown> = { expires_at: newExpiresAt };
  if (link.status === "expired") update.status = "pending";
  const { error } = await supabase.from("discovery_form_links").update(update).eq("id", linkId);
  if (error) return { ok: false, message: error.message };

  // Audit: تجديد الرابط (نفس نمط أحداث discovery_link في session-service)
  await supabase.from("audit_log").insert({
    actor_id: auth.userId ?? null,
    entity_type: "discovery_link",
    entity_id: linkId,
    action: "update",
    changes: {
      event: "link_renewed",
      project_id: link.project_id,
      previous_expires_at: link.expires_at,
      new_expires_at: newExpiresAt,
      value: expirationValue,
      reactivated: link.status === "expired",
    },
  });

  revalidatePath(`/dashboard/projects/${link.project_id}`);
  return { ok: true };
}

/** Alias صريح للتجديد (UX) — نفس منطق changeSessionExpiration. */
export async function renewDiscoverySession(linkId: string, expirationValue: string): Promise<LinkResult> {
  return changeSessionExpiration(linkId, expirationValue);
}

/** إيقاف رابط جلسة (لا يعود صالحًا للفتح). */
export async function cancelDiscoverySession(linkId: string): Promise<LinkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data: link, error } = await supabase
    .from("discovery_form_links")
    .update({ status: "cancelled" })
    .eq("id", linkId)
    .select("project_id")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (link) revalidatePath(`/dashboard/projects/${link.project_id}`);
  return { ok: true };
}

/** إعادة فتح تسليم جلسة — يفكّ قفل استجاباتها ويسمح بالتعديل من جديد. */
export async function reopenSessionSubmission(linkId: string): Promise<LinkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const projectId = await projectIdOfLink(supabase, linkId);
  const [{ error }] = await Promise.all([
    supabase.from("discovery_form_links").update({ status: "opened", submitted_at: null }).eq("id", linkId),
    supabase.from("discovery_forms").update({ status: "draft" }).eq("link_id", linkId),
  ]);
  if (error) return { ok: false, message: error.message };
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
