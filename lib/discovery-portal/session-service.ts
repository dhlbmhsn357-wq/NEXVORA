import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryFormLink, DiscoverySnapshotItem } from "@/lib/types/database";
import { generateDiscoveryToken, computeExpiresAt } from "./token";

/**
 * يكتب استجابات جلسة (find-then-update/insert بدل upsert onConflict، لأن
 * القيد الفريد جزئي على link_id). استجابة واحدة لكل جلسة (link_id).
 */
export async function upsertSessionForm(
  supabase: SupabaseClient,
  params: {
    linkId: string;
    projectId: string;
    templateId: string | null;
    answers: Record<string, unknown>;
    snapshot: DiscoverySnapshotItem[];
    status: "draft" | "submitted";
    submittedAt?: string | null;
  }
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from("discovery_forms")
    .select("id")
    .eq("link_id", params.linkId)
    .maybeSingle();

  const row = {
    project_id: params.projectId,
    link_id: params.linkId,
    template_id: params.templateId,
    answers: params.answers,
    questions_snapshot: params.snapshot,
    status: params.status,
    ...(params.submittedAt !== undefined ? { submitted_at: params.submittedAt } : {}),
  };

  if (existing) {
    const { error } = await supabase.from("discovery_forms").update(row).eq("id", existing.id);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("discovery_forms").insert(row);
  return { error: error?.message ?? null };
}

const SESSION_COLUMNS =
  "id, project_id, lead_id, template_id, token, status, expires_at, opened_at, submitted_at, last_activity_at, created_by, created_at, updated_at, first_open_at, visit_count, last_country, last_device, last_browser, last_reminder_at, reminder_count, session_name, department, tags";

/** جلسة اكتشاف مع أرقام محسوبة للعرض في المكتبة. */
export interface DiscoverySessionSummary {
  link: DiscoveryFormLink;
  templateName: string | null;
  questionCount: number;
  answeredCount: number;
  completionPct: number;
  responsesCount: number;
}

/**
 * كل جلسات الاكتشاف لمشروع (مرتّبة الأحدث أولًا) مع أرقام العرض:
 * عدد الأسئلة، عدد المُجاب، نسبة الإكمال، وعدد الاستجابات. جلسة = صف رابط.
 */
export async function listSessions(supabase: SupabaseClient, projectId: string): Promise<DiscoverySessionSummary[]> {
  const { data: links } = await supabase
    .from("discovery_form_links")
    .select(SESSION_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const sessions = (links ?? []) as DiscoveryFormLink[];
  if (sessions.length === 0) return [];

  const templateIds = [...new Set(sessions.map((s) => s.template_id).filter((v): v is string => !!v))];
  const linkIds = sessions.map((s) => s.id);

  const [{ data: templates }, { data: questionRows }, { data: forms }] = await Promise.all([
    templateIds.length > 0
      ? supabase.from("discovery_form_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    templateIds.length > 0
      ? supabase.from("discovery_questions").select("template_id").in("template_id", templateIds)
      : Promise.resolve({ data: [] as Array<{ template_id: string }> }),
    supabase.from("discovery_forms").select("link_id, answers").in("link_id", linkIds),
  ]);

  const templateName = new Map((templates ?? []).map((t) => [t.id as string, t.name as string]));
  const qCount = new Map<string, number>();
  for (const r of (questionRows ?? []) as Array<{ template_id: string }>) {
    qCount.set(r.template_id, (qCount.get(r.template_id) ?? 0) + 1);
  }
  const answersByLink = new Map<string, Record<string, unknown>>();
  for (const f of (forms ?? []) as Array<{ link_id: string | null; answers: Record<string, unknown> }>) {
    if (f.link_id) answersByLink.set(f.link_id, f.answers ?? {});
  }

  return sessions.map((link) => {
    const questionCount = link.template_id ? qCount.get(link.template_id) ?? 0 : 0;
    const answers = answersByLink.get(link.id) ?? {};
    const answeredCount = Object.values(answers).filter((v) => {
      if (v === undefined || v === null || v === "") return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }).length;
    const completionPct = questionCount > 0 ? Math.round((answeredCount / questionCount) * 100) : 0;
    return {
      link,
      templateName: link.template_id ? templateName.get(link.template_id) ?? null : null,
      questionCount,
      answeredCount,
      completionPct,
      responsesCount: answersByLink.has(link.id) ? 1 : 0,
    };
  });
}

export interface SessionResponseItemData {
  key: string;
  label: string;
  category: string | null;
  answer: unknown;
  answered: boolean;
}
export interface SessionResponsesData {
  found: boolean;
  sessionName: string | null;
  department: string | null;
  templateName: string | null;
  status: string | null;
  submittedAt: string | null;
  answeredCount: number;
  totalCount: number;
  items: SessionResponseItemData[];
}

/**
 * يجيب إجابات جلسة اكتشاف مُهيكلة للعرض/الطباعة — يقرن كل سؤال (من الـ
 * snapshot المحفوظ وقت التعبئة، وإلا أسئلة القالب) بإجابة العميل، مرتّبة
 * بترتيب الأسئلة. دالة بيانات نقية بلا أي فحص صلاحية — المُستدعي مسؤول
 * عن الحماية (Server Action أو صفحة محمية).
 */
export async function fetchSessionResponses(
  supabase: SupabaseClient,
  linkId: string
): Promise<SessionResponsesData> {
  const empty: SessionResponsesData = {
    found: false,
    sessionName: null,
    department: null,
    templateName: null,
    status: null,
    submittedAt: null,
    answeredCount: 0,
    totalCount: 0,
    items: [],
  };

  const { data: link } = await supabase
    .from("discovery_form_links")
    .select("session_name, department, status, submitted_at, template_id")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return empty;

  const [{ data: form }, tplRes] = await Promise.all([
    supabase
      .from("discovery_forms")
      .select("answers, questions_snapshot, status, submitted_at")
      .eq("link_id", linkId)
      .maybeSingle(),
    link.template_id
      ? supabase.from("discovery_form_templates").select("name").eq("id", link.template_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const answers = ((form?.answers as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

  type QMeta = { key: string; label: string; category: string | null; order: number };
  let questions: QMeta[] = [];
  const snapshot =
    (form?.questions_snapshot as Array<{ key: string; label: string; category: string | null; order: number }> | null) ??
    null;
  if (snapshot && snapshot.length > 0) {
    questions = snapshot.map((s) => ({ key: s.key, label: s.label, category: s.category ?? null, order: s.order ?? 0 }));
  } else if (link.template_id) {
    const { data: qs } = await supabase
      .from("discovery_questions")
      .select("id, question, category, sort_order")
      .eq("template_id", link.template_id as string)
      .order("sort_order", { ascending: true });
    questions = (qs ?? []).map((q, i) => ({
      key: q.id as string,
      label: q.question as string,
      category: (q.category as string | null) ?? null,
      order: (q.sort_order as number | null) ?? i,
    }));
  }
  questions.sort((a, b) => a.order - b.order);

  const isEmpty = (v: unknown) =>
    v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

  const items: SessionResponseItemData[] = questions.map((q) => {
    const answer = answers[q.key];
    return { key: q.key, label: q.label, category: q.category, answer, answered: !isEmpty(answer) };
  });

  return {
    found: true,
    sessionName: (link.session_name as string | null) ?? null,
    department: (link.department as string | null) ?? null,
    templateName: (tplRes.data?.name as string | null) ?? null,
    status: (form?.status as string | null) ?? (link.status as string | null) ?? null,
    submittedAt: (form?.submitted_at as string | null) ?? (link.submitted_at as string | null) ?? null,
    answeredCount: items.filter((i) => i.answered).length,
    totalCount: items.length,
    items,
  };
}

export interface CreateSessionInput {
  projectId: string;
  templateId: string;
  sessionName: string;
  department?: string | null;
  leadId?: string | null;
  expiresInDays?: number | null;
  actorId?: string | null;
}

/**
 * ينشئ جلسة اكتشاف جديدة — صف رابط جديد بـ token خاص دائم. **لا يستبدل**
 * أي جلسة سابقة. بيرجّع الـ token عشان الواجهة تعرض الرابط.
 */
export async function createSession(
  supabase: SupabaseClient,
  input: CreateSessionInput
): Promise<{ ok: boolean; token?: string; linkId?: string; message?: string }> {
  const token = generateDiscoveryToken();
  const expiresAt = input.expiresInDays != null ? computeExpiresAt(input.expiresInDays, Date.now()) : null;

  const { data, error } = await supabase
    .from("discovery_form_links")
    .insert({
      project_id: input.projectId,
      lead_id: input.leadId ?? null,
      template_id: input.templateId,
      token,
      status: "pending",
      expires_at: expiresAt,
      session_name: input.sessionName.trim() || "جلسة اكتشاف",
      department: input.department?.trim() || null,
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "تعذّر إنشاء الجلسة." };

  await supabase.from("audit_log").insert({
    actor_id: input.actorId ?? null,
    entity_type: "discovery_link",
    entity_id: data.id,
    action: "create",
    changes: { event: "session_created", project_id: input.projectId, session_name: input.sessionName },
  });

  return { ok: true, token, linkId: data.id as string };
}

/**
 * حذف جلسة نهائيًا (يدوي فقط) — بيحذف الرابط واستجاباته (cascade). لا
 * يؤثر على أي جلسة تانية. مفيش حذف تلقائي في أي مكان.
 */
export async function deleteSession(
  supabase: SupabaseClient,
  linkId: string,
  actorId?: string | null
): Promise<{ ok: boolean; message?: string }> {
  const { data: link } = await supabase.from("discovery_form_links").select("project_id").eq("id", linkId).maybeSingle();
  const { error } = await supabase.from("discovery_form_links").delete().eq("id", linkId);
  if (error) return { ok: false, message: error.message };

  if (link) {
    await supabase.from("audit_log").insert({
      actor_id: actorId ?? null,
      entity_type: "discovery_link",
      entity_id: linkId,
      action: "delete",
      changes: { event: "session_deleted", project_id: link.project_id },
    });
  }
  return { ok: true };
}
