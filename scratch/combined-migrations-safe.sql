-- ============================================================
-- نسخة آمنة 100% لإعادة التشغيل — تجمع 0014 لـ 0018 كاملين.
-- كل أمر "create policy" اتلف بـ DO block بيتجاهل الخطأ لو الـ
-- Policy موجودة بالفعل من محاولة سابقة. باقي الأوامر أصلاً آمنة
-- (if not exists) من غير أي تعديل.
-- ============================================================

-- ============================================================
-- Phase 10 — Developer Review Handoff Package: Database
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

insert into public.ai_task_model_config (task_type, provider, model)
values ('developer_handoff_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

alter table public.developer_handoff enable row level security;
alter table public.developer_handoff_versions enable row level security;

do $$ begin
  create policy "internal_read_developer_handoff" on public.developer_handoff
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_write_developer_handoff" on public.developer_handoff
    for all using (auth.uid() is not null) with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_read_developer_handoff_versions" on public.developer_handoff_versions
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_write_developer_handoff_versions" on public.developer_handoff_versions
    for all using (auth.uid() is not null) with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ============================================================
-- Phase 11 — Smart Post-Launch Support: Database
-- ============================================================
alter table public.projects add column if not exists widget_key uuid unique;

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

insert into public.ai_task_model_config (task_type, provider, model)
values ('support_triage', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

alter table public.support_requests enable row level security;
alter table public.support_observability_log enable row level security;

do $$ begin
  create policy "internal_read_support_requests" on public.support_requests
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_write_support_requests" on public.support_requests
    for all using (auth.uid() is not null) with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_read_support_observability_log" on public.support_observability_log
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_write_support_observability_log" on public.support_observability_log
    for all using (auth.uid() is not null) with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ============================================================
-- Post-Audit Hardening — Critical Fixes (0016)
-- ============================================================
alter table public.leads       add column if not exists archived_at timestamptz;
alter table public.projects    add column if not exists archived_at timestamptz;
alter table public.meetings    add column if not exists archived_at timestamptz;

create index if not exists idx_leads_archived    on public.leads(archived_at) where archived_at is null;
create index if not exists idx_projects_archived on public.projects(archived_at) where archived_at is null;
create index if not exists idx_meetings_archived on public.meetings(archived_at) where archived_at is null;

create unique index if not exists idx_projects_lead_unique
  on public.projects(lead_id)
  where lead_id is not null;

create table if not exists public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_lookup
  on public.rate_limit_hits(scope, identifier, created_at desc);

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

do $$ begin
  create policy "internal_read_rate_limit_hits" on public.rate_limit_hits
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- خطوة إلزامية بعد تشغيل هذا الملف: ارفع دور صاحب المنصة إلى owner
-- update public.profiles set role = 'owner' where email = 'teachermohsenashraf@gmail.com';

-- ============================================================
-- Post-Audit Hardening — High Priority Fixes (0017)
-- ============================================================
create index if not exists idx_projects_stage
  on public.projects(stage)
  where archived_at is null;

create index if not exists idx_leads_status
  on public.leads(status)
  where archived_at is null;

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
-- Post-Audit Hardening — Low Priority Fixes (0018)
-- ============================================================
alter table public.support_requests
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_support_requests_assigned
  on public.support_requests(assigned_to)
  where assigned_to is not null;
