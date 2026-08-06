-- ============================================================
-- Production Validation Engine (Phase 4 — End-to-End QA & Production
-- Validation). رابعة محركات الفحص الحقيقية داخل Engineering QA، بعد
-- Static Architecture Review (12.2) وSecurity/Database Audit (12.3).
-- بخلاف المحركات السابقة (بتقرا كود مصدري من GitHub)، المحرك ده بيدوس
-- على نسخة شغّالة فعليًا من التطبيق (Staging/Preview URL) بمتصفح
-- حقيقي (Playwright + Chromium). مفيش مفهوم "Incremental" هنا (كل
-- Session بتختبر الحالة الحيّة الحالية بالكامل، مش فرق كود) — عكس
-- Static/Security/Database اللي بتقارن Commits.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 0) رابط Staging/Preview لكل مشروع — لازم قبل أي Validation Session.
-- ممنوع تشغيل الاختبارات على Production مباشرة (راجع lib/production-validation/generation-service.ts).
-- ============================================================
alter table public.projects add column if not exists staging_url text;

-- ============================================================
-- 1) Bucket خاص للـ Screenshots (Evidence) — مش Public، الوصول عبر Signed URL بس.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('validation-screenshots', 'validation-screenshots', false)
on conflict (id) do nothing;

do $$ begin
  create policy "service_role_all_validation_screenshots" on storage.objects
    for all
    using (bucket_id = 'validation-screenshots' and auth.role() = 'service_role')
    with check (bucket_id = 'validation-screenshots' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_read_validation_screenshots" on storage.objects
    for select
    using (bucket_id = 'validation-screenshots' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ============================================================
-- 2) validation_sessions — تشغيلة واحدة (Session) لكل محاولة Validation.
-- ============================================================
create table if not exists public.validation_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  engineering_review_id uuid references public.engineering_reviews(id) on delete set null,
  engineering_stage_id uuid references public.engineering_review_stages(id) on delete set null,
  version integer not null,
  status text not null default 'idle'
    check (status in ('idle','generating','ready','failed')),
  last_error text,
  staging_url text not null default '',
  browser text not null default 'chromium',
  viewport_matrix jsonb not null default '[]'::jsonb,
  journeys_generated integer not null default 0,
  journeys_passed integer not null default 0,
  journeys_failed integer not null default 0,
  journeys_flaky integer not null default 0,
  category_count integer not null default 4,
  score_summary jsonb,
  production_ready boolean,
  production_ready_reason text not null default '',
  generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_validation_sessions_project_version on public.validation_sessions(project_id, version);
create index if not exists idx_validation_sessions_project on public.validation_sessions(project_id, created_at desc);
create unique index if not exists idx_validation_sessions_one_active_per_project on public.validation_sessions(project_id) where status = 'generating';

create or replace function public.touch_validation_sessions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_validation_sessions_update_touch on public.validation_sessions;
create trigger on_validation_sessions_update_touch
  before update on public.validation_sessions
  for each row execute procedure public.touch_validation_sessions_updated_at();

-- ============================================================
-- 3) validation_journeys — رحلات مستخدم مُولَّدة بالـ AI من PRD/Brain/
-- Prototype Prompt/Developer Handoff، كل واحدة بخطواتها (steps jsonb).
-- ============================================================
create table if not exists public.validation_journeys (
  id uuid primary key default gen_random_uuid(),
  validation_session_id uuid not null references public.validation_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  journey_key text not null,
  name text not null,
  goal text not null default '',
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','running','passed','failed')),
  retry_count integer not null default 0,
  is_flaky boolean not null default false,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_validation_journeys_session_key on public.validation_journeys(validation_session_id, journey_key);
create index if not exists idx_validation_journeys_project on public.validation_journeys(project_id);

create or replace function public.touch_validation_journeys_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_validation_journeys_update_touch on public.validation_journeys;
create trigger on_validation_journeys_update_touch
  before update on public.validation_journeys
  for each row execute procedure public.touch_validation_journeys_updated_at();

-- ============================================================
-- 4) validation_steps — سجل تنفيذ كل خطوة فعليًا (Evidence خام).
-- ============================================================
create table if not exists public.validation_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.validation_journeys(id) on delete cascade,
  validation_session_id uuid not null references public.validation_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  step_index integer not null,
  step_type text not null,
  step_description text not null default '',
  status text not null
    check (status in ('passed','failed')),
  actual_result text not null default '',
  screenshot_path text,
  console_errors jsonb not null default '[]'::jsonb,
  network_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_validation_steps_journey on public.validation_steps(journey_id, step_index);
create index if not exists idx_validation_steps_project on public.validation_steps(project_id);

-- ============================================================
-- 5) validation_categories — 4 صفوف ثابتة لكل Session (Journey
-- Execution, Responsive Validation, Accessibility Validation, Visual
-- Regression). Visual Regression بنية تحتية فقط في هذه النسخة (راجع
-- التقرير الختامي) — بتتعلّم "ready" فورًا بدرجة null صريحة.
-- ============================================================
create table if not exists public.validation_categories (
  id uuid primary key default gen_random_uuid(),
  validation_session_id uuid not null references public.validation_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('journey_execution','responsive_validation','accessibility_validation','visual_regression')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_validation_categories_session_key on public.validation_categories(validation_session_id, category_key);
create index if not exists idx_validation_categories_project on public.validation_categories(project_id);

create or replace function public.touch_validation_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_validation_categories_update_touch on public.validation_categories;
create trigger on_validation_categories_update_touch
  before update on public.validation_categories
  for each row execute procedure public.touch_validation_categories_updated_at();

-- ============================================================
-- 6) validation_findings — كل مشكلة مُكتشفة، بدليل كامل (Screenshot,
-- Console Logs, Network Logs, Stack Trace, Browser, OS, Viewport,
-- Journey, Steps To Reproduce, Expected/Actual). occurrence_count
-- بيحمل نتيجة الـ Auto Grouping (دمج نفس الخطأ المتكرر في صف واحد).
-- ============================================================
create table if not exists public.validation_findings (
  id uuid primary key default gen_random_uuid(),
  validation_session_id uuid not null references public.validation_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('journey_execution','responsive_validation','accessibility_validation','visual_regression')),
  finding_key text not null,
  severity text not null
    check (severity in ('critical','high','medium','low','info')),
  title text not null,
  description text not null default '',
  impact text not null default '',
  root_cause text not null default '',
  recommended_fix text not null default '',
  steps_to_reproduce jsonb not null default '[]'::jsonb,
  expected_result text not null default '',
  actual_result text not null default '',
  screenshot_path text,
  console_logs jsonb not null default '[]'::jsonb,
  network_logs jsonb not null default '[]'::jsonb,
  stack_trace text not null default '',
  browser text not null default 'chromium',
  os text not null default '',
  viewport text not null default '',
  journey_name text not null default '',
  occurrence_count integer not null default 1,
  is_flaky boolean not null default false,
  confidence_score integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists idx_validation_findings_session on public.validation_findings(validation_session_id, category_key);
create index if not exists idx_validation_findings_project on public.validation_findings(project_id);

-- ============================================================
-- 7) Task Types جديدة (توليد الرحلات + إثراء كل محور بالـ Findings).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('production_validation_journey_generation', 'gemini', 'gemini-3.5-flash'),
  ('production_validation_category_enrichment', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.validation_sessions enable row level security;
alter table public.validation_journeys enable row level security;
alter table public.validation_steps enable row level security;
alter table public.validation_categories enable row level security;
alter table public.validation_findings enable row level security;

create policy "internal_read_validation_sessions" on public.validation_sessions for select using (auth.uid() is not null);
create policy "internal_write_validation_sessions" on public.validation_sessions for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_validation_journeys" on public.validation_journeys for select using (auth.uid() is not null);
create policy "internal_write_validation_journeys" on public.validation_journeys for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_validation_steps" on public.validation_steps for select using (auth.uid() is not null);
create policy "internal_write_validation_steps" on public.validation_steps for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_validation_categories" on public.validation_categories for select using (auth.uid() is not null);
create policy "internal_write_validation_categories" on public.validation_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_validation_findings" on public.validation_findings for select using (auth.uid() is not null);
create policy "internal_write_validation_findings" on public.validation_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
