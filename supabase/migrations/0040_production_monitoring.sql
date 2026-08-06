-- ============================================================
-- Production Monitoring & Self-Healing Intelligence (Phase 5) —
-- مراقبة مستمرة (يومية + يدوية) بعد النشر، منفصلة تمامًا عن Engineering
-- QA (Phase 12.1-12.3 + Phase 4): تلك مراجعات لحظة واحدة قبل التسليم،
-- وهذه مراقبة مستمرة بعد التسليم. نفس محرك Playwright الحقيقي من
-- Phase 4 (Production Validation)، لكن هنا فحوصات خفيفة غير هدّامة
-- (Read-Only) بدل اختبار E2E كامل — آمنة على بيئة إنتاج حقيقية.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 0) رابط Production منفصل عن staging_url (Phase 4) — الأول للمراقبة
-- بعد الإطلاق (فحوصات خفيفة آمنة)، والتاني لاختبار E2E الهدّام قبل
-- الإطلاق. لو production_url فاضي، المراقبة بترجع لـ staging_url.
-- ============================================================
alter table public.projects add column if not exists production_url text;

-- ============================================================
-- 1) monitoring_checks — تشغيلة فحص واحدة (يومية أو يدوية أو بعد Deployment).
-- ============================================================
create table if not exists public.monitoring_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target_url text not null default '',
  status text not null default 'pending'
    check (status in ('pending','running','ready','failed')),
  last_error text,
  triggered_by text not null default 'manual'
    check (triggered_by in ('cron','manual','deployment')),
  overall_status text
    check (overall_status in ('healthy','degraded','down')),
  http_status integer,
  response_time_ms integer,
  page_load_time_ms integer,
  lcp_ms integer,
  cls numeric,
  console_error_count integer not null default 0,
  health_score integer,
  performance_score integer,
  is_regression boolean not null default false,
  previous_check_id uuid references public.monitoring_checks(id) on delete set null,
  checked_pages jsonb not null default '[]'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_monitoring_checks_project on public.monitoring_checks(project_id, created_at desc);
-- فحص واحد نشط بالمشروع في نفس اللحظة.
create unique index if not exists idx_monitoring_checks_one_active_per_project on public.monitoring_checks(project_id) where status = 'running';

create or replace function public.touch_monitoring_checks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_monitoring_checks_update_touch on public.monitoring_checks;
create trigger on_monitoring_checks_update_touch
  before update on public.monitoring_checks
  for each row execute procedure public.touch_monitoring_checks_updated_at();

-- ============================================================
-- 2) monitoring_incidents — كل مشكلة مُكتشفة (Auto Grouping: نفس
-- incident_key وهو لسه "open" بيتحدّث occurrence_count/last_seen_at
-- بدل إنشاء صف جديد). كل الحقول النصية بتتمر على نفس Masking المبني
-- في Phase 12.3 قبل التخزين.
-- ============================================================
create table if not exists public.monitoring_incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  first_check_id uuid references public.monitoring_checks(id) on delete set null,
  last_check_id uuid references public.monitoring_checks(id) on delete set null,
  incident_key text not null,
  category text not null
    check (category in ('frontend','api','performance','availability','console_error','regression')),
  severity text not null
    check (severity in ('critical','high','medium','low','info')),
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved')),
  title text not null,
  description text not null default '',
  root_cause text not null default '',
  confidence_score integer not null default 100,
  evidence jsonb not null default '{}'::jsonb,
  affected_pages jsonb not null default '[]'::jsonb,
  patch_proposal text not null default '',
  refactoring_proposal text not null default '',
  performance_proposal text not null default '',
  security_proposal text not null default '',
  ux_proposal text not null default '',
  similar_incident_id uuid references public.monitoring_incidents(id) on delete set null,
  similarity_reason text not null default '',
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_monitoring_incidents_project_key_open on public.monitoring_incidents(project_id, incident_key) where status != 'resolved';
create index if not exists idx_monitoring_incidents_project on public.monitoring_incidents(project_id, severity);

-- ============================================================
-- 3) monitoring_incident_events — Incident Timeline (بداية/اكتشاف/تنبيه/إقرار/إغلاق).
-- ============================================================
create table if not exists public.monitoring_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.monitoring_incidents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null
    check (event_type in ('detected','alerted','acknowledged','fix_proposed','resolved','reoccurred')),
  detail text not null default '',
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_monitoring_incident_events_incident on public.monitoring_incident_events(incident_id, created_at);

-- ============================================================
-- 4) Task Type جديد (إثراء حادثة واحدة بالـ AI — Root Cause + Proposals).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('production_monitoring_incident_analysis', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.monitoring_checks enable row level security;
alter table public.monitoring_incidents enable row level security;
alter table public.monitoring_incident_events enable row level security;

create policy "internal_read_monitoring_checks" on public.monitoring_checks for select using (auth.uid() is not null);
create policy "internal_write_monitoring_checks" on public.monitoring_checks for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_monitoring_incidents" on public.monitoring_incidents for select using (auth.uid() is not null);
create policy "internal_write_monitoring_incidents" on public.monitoring_incidents for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_monitoring_incident_events" on public.monitoring_incident_events for select using (auth.uid() is not null);
create policy "internal_write_monitoring_incident_events" on public.monitoring_incident_events for all using (auth.uid() is not null) with check (auth.uid() is not null);
