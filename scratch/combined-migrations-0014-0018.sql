-- ============================================================
-- Phase 10 — Developer Review Handoff Package: Database
-- إضافات بحتة، لا تلمس project_brain / prd / prototype_review.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) developer_handoff — الصف الحي الحالي (نفس نمط prd/prototype_review)
-- package_content jsonb بيحتوي الأقسام السبعة بالضبط.
-- ============================================================
create table if not exists public.developer_handoff (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  package_content jsonb not null default '{}'::jsonb,
  repo_url text not null default '',
  repo_ref text not null default '',
  generated_from_prd_version integer,
  generated_from_review_version integer,
  access_credentials_ref text,
  handoff_status text not null default 'draft'
    check (handoff_status in ('draft','in_review','completed')),
  version integer not null default 0,
  sync_status text not null default 'idle'
    check (sync_status in ('idle','generating','failed')),
  share_token text unique,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_developer_handoff_project_unique on public.developer_handoff(project_id);
-- Unique حاليًا (حزمة تسليم حية واحدة لكل مشروع)، بنفس فلسفة الجداول السابقة.

create or replace function public.touch_developer_handoff_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_developer_handoff_update_touch on public.developer_handoff;
create trigger on_developer_handoff_update_touch
  before update on public.developer_handoff
  for each row execute procedure public.touch_developer_handoff_updated_at();

-- ============================================================
-- 2) developer_handoff_versions — سجل تاريخي كامل، بدون حذف أي نسخة
-- ============================================================
create table if not exists public.developer_handoff_versions (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.developer_handoff(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  package_content jsonb,
  repo_url text,
  repo_ref text,
  generated_from_prd_version integer,
  generated_from_review_version integer,
  handoff_status text,
  reason text not null
    check (reason in ('full_generation','manual_edit','status_change')),
  section_regenerated text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_developer_handoff_versions_handoff on public.developer_handoff_versions(handoff_id, version desc);
create index if not exists idx_developer_handoff_versions_project on public.developer_handoff_versions(project_id);

-- ============================================================
-- 3) Task Type جديد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('developer_handoff_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة (كل مستخدم داخلي مسجّل دخول)
-- ============================================================
alter table public.developer_handoff enable row level security;
alter table public.developer_handoff_versions enable row level security;

create policy "internal_read_developer_handoff" on public.developer_handoff
  for select using (auth.uid() is not null);
create policy "internal_write_developer_handoff" on public.developer_handoff
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_developer_handoff_versions" on public.developer_handoff_versions
  for select using (auth.uid() is not null);
create policy "internal_write_developer_handoff_versions" on public.developer_handoff_versions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
-- ============================================================
-- Phase 11 — Smart Post-Launch Support: Database
-- إضافة عمود واحد على projects (widget_key) + جدولين جديدين.
-- لا تلمس project_brain / prd إطلاقًا.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 0) projects.widget_key — نفس نمط share_token المستخدم في
-- client_presentations/developer_handoff بالظبط، لكن هنا للسماح
-- بتضمين الـ Support Widget علنًا لكل مشروع عبر مفتاح فريد قابل للإلغاء.
-- ============================================================
alter table public.projects add column if not exists widget_key uuid unique;

-- ============================================================
-- 1) support_requests — سجل كل محادثة دعم انتهت (سواء اتحلت مباشرة
-- أو اتصعّدت)، مع سجل غير قابل للتعديل للمحادثة الكاملة.
-- ============================================================
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_transcript jsonb not null default '[]'::jsonb,
  request_type text not null default 'unclear'
    check (request_type in ('usage_question','usage_problem','bug','feature_request','change_request','unclear')),
  structured_summary jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'open'
    check (resolution_status in ('open','auto_resolved','escalated','in_progress','resolved')),
  escalated_at timestamptz,
  resolved_at timestamptz,
  related_prd_section text,
  related_brain_fact text,
  customer_identifier text,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_requests_project on public.support_requests(project_id, created_at desc);
create index if not exists idx_support_requests_customer on public.support_requests(project_id, customer_identifier);

-- Conversation Transcript غير قابل للتعديل بعد الحفظ — قيد فعلي على
-- مستوى القاعدة، مش مجرد اتفاق في طبقة التطبيق.
create or replace function public.prevent_transcript_update()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_transcript is distinct from old.conversation_transcript then
    raise exception 'conversation_transcript غير قابل للتعديل بعد الحفظ';
  end if;
  return new;
end;
$$;

drop trigger if exists on_support_requests_protect_transcript on public.support_requests;
create trigger on_support_requests_protect_transcript
  before update on public.support_requests
  for each row execute procedure public.prevent_transcript_update();

-- ============================================================
-- 2) support_observability_log — سجل تشخيصي بسيط لـ Escalations
-- وNotification Delivery وWidget Errors فقط (AI Requests/Errors
-- مُغطّاة بالفعل عبر ai_requests_log الموجود، بدون تكرار).
-- ============================================================
create table if not exists public.support_observability_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('escalation','notification_delivery','widget_error')),
  project_id uuid references public.projects(id) on delete set null,
  support_request_id uuid references public.support_requests(id) on delete set null,
  success boolean not null,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_observability_log_project on public.support_observability_log(project_id, created_at desc);

-- ============================================================
-- 3) Task Type جديد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('support_triage', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة (كل مستخدم داخلي
-- مسجّل دخول). الـ Widget والـ API العام بيكتبوا عبر Service Role
-- Client (بيتخطى RLS بتصميم)، بنفس نمط present/[token] الموجود.
-- ============================================================
alter table public.support_requests enable row level security;
alter table public.support_observability_log enable row level security;

create policy "internal_read_support_requests" on public.support_requests
  for select using (auth.uid() is not null);
create policy "internal_write_support_requests" on public.support_requests
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_support_observability_log" on public.support_observability_log
  for select using (auth.uid() is not null);
create policy "internal_write_support_observability_log" on public.support_observability_log
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
-- ============================================================
-- Post-Audit Hardening — Critical Fixes
-- 1) Soft Delete/Archive على الكيانات الأساسية (leads/projects/meetings)
--    — يمنع فقدان البيانات بلا رجعة ويلغي داعي حذف مباشر من Supabase
-- 2) جدول rate_limit_hits لحماية المسارات العامة (Widget/Webhook)
-- 3) توثيق إن أعمدة role موجودة وستُفعّل في طبقة التطبيق
--    (السياسات تفضل كما هي حاليًا؛ الـ Enforcement في Server Actions/API)
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) archived_at — Soft Delete عام لكل كيان قابل للأرشفة
-- ============================================================
alter table public.leads       add column if not exists archived_at timestamptz;
alter table public.projects    add column if not exists archived_at timestamptz;
alter table public.meetings    add column if not exists archived_at timestamptz;

create index if not exists idx_leads_archived    on public.leads(archived_at) where archived_at is null;
create index if not exists idx_projects_archived on public.projects(archived_at) where archived_at is null;
create index if not exists idx_meetings_archived on public.meetings(archived_at) where archived_at is null;

-- ============================================================
-- 2) فهرس فريد يمنع تحويل نفس Lead لمشروع أكثر من مرة
-- (طبقة دفاع ثانية بجانب فحص التطبيق نفسه)
-- ============================================================
create unique index if not exists idx_projects_lead_unique
  on public.projects(lead_id)
  where lead_id is not null;

-- ============================================================
-- 3) rate_limit_hits — سقف طلبات بسيط للمسارات العامة
-- ============================================================
create table if not exists public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,               -- مثال: 'support_chat'
  identifier text not null,          -- widget_key أو IP
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_lookup
  on public.rate_limit_hits(scope, identifier, created_at desc);

-- تنظيف تلقائي: احذف الطلبات الأقدم من 24 ساعة عند كل insert
-- (بأسلوب "مقاطعة نادرة" — لو مش عايز trigger، شيله ونظّف بجدولة يدوية)
create or replace function public.cleanup_old_rate_limit_hits()
returns trigger
language plpgsql
as $$
begin
  delete from public.rate_limit_hits
  where created_at < now() - interval '24 hours';
  return new;
end;
$$;

-- تشغيل التنظيف عشوائيًا (كل ~50 insert تقريبًا) بدل كل مرة عشان مايبطّئش
create or replace function public.maybe_cleanup_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if random() < 0.02 then
    delete from public.rate_limit_hits
    where created_at < now() - interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists on_rate_limit_insert_cleanup on public.rate_limit_hits;
create trigger on_rate_limit_insert_cleanup
  after insert on public.rate_limit_hits
  for each row execute procedure public.maybe_cleanup_rate_limit();

alter table public.rate_limit_hits enable row level security;

-- كتابة من Service Role فقط (الـ API routes)؛ قراءة داخلية للتشخيص
create policy "internal_read_rate_limit_hits" on public.rate_limit_hits
  for select using (auth.uid() is not null);

-- ============================================================
-- ملاحظة: أعمدة profiles.role موجودة من Phase 1، لكنها لم تكن مُطبَّقة.
-- من هذه المرحلة، حساس الأمان (Settings الحساسة، Archive) سيتحقق من role
-- في طبقة التطبيق (Server Actions) بدل تعديل RLS — لأن RLS تمنع بشكل صامت
-- والـ Server Action يمكنها إرجاع رسالة واضحة للمستخدم.
--
-- خطوة إلزامية بعد تشغيل هذا الملف: ارفع دور صاحب المنصة إلى owner
-- (استبدل الإيميل بإيميلك):
--   update public.profiles set role = 'owner'
--   where email = 'teachermohsenashraf@gmail.com';
-- بدون هذه الخطوة، لن يقدر أي مستخدم أن يغيّر إعدادات AI أو يعمل
-- أرشفة، لأن الجميع بيتخلقوا افتراضيًا كـ member.
-- ============================================================
-- ============================================================
-- Post-Audit Hardening — High Priority Fixes
-- 1) Indexes على أعمدة الفلترة الأكثر استخدامًا (projects.stage, leads.status)
-- 2) تتبّع Share Tokens (إنشاء + آخر استخدام) لكل مصادر الروابط العامة
-- 3) توثيق حالة "reopened" كقيمة مسموحة في stage (نص حر، مش check قسري)
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) فهارس على أعمدة الفلترة — تفضل النتائج سريعة مع نمو البيانات
-- ============================================================
create index if not exists idx_projects_stage
  on public.projects(stage)
  where archived_at is null;

create index if not exists idx_leads_status
  on public.leads(status)
  where archived_at is null;

-- ============================================================
-- 2) تتبّع Share Tokens — لكل مصدر رابط عام (Presentation, Handoff,
--    Widget). الأعمدة nullable — لو null يعني مفيش تفعيل قط.
-- ============================================================
alter table public.client_presentations
  add column if not exists share_token_created_at timestamptz,
  add column if not exists share_token_last_used_at timestamptz;

alter table public.developer_handoff
  add column if not exists share_token_created_at timestamptz,
  add column if not exists share_token_last_used_at timestamptz;

alter table public.projects
  add column if not exists widget_key_created_at timestamptz,
  add column if not exists widget_key_last_used_at timestamptz;

-- ============================================================
-- 3) دورة حياة المشروع الموسّعة — قيمة "reopened" مسموحة كنص حر
--    (العمود stage هو text مش enum من التصميم الأصلي، فمفيش تعديل schema
--    مطلوب، بس توثيق للفريق).
-- ============================================================
-- لا شيء يُنفَّذ هنا — القيمة "reopened" ستُستخدم في طبقة التطبيق
-- كامتداد لقيم stage القائمة.
-- ============================================================
-- Post-Audit Hardening — Low Priority Fixes
-- 1) assigned_to على support_requests (تعيين مسؤول للمتابعة)
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

alter table public.support_requests
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_support_requests_assigned
  on public.support_requests(assigned_to)
  where assigned_to is not null;
