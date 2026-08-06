-- ============================================================
-- Security & Database Audit (Phase 12.3) — ثاني وثالث محرك فحص حقيقي
-- داخل Engineering QA، بعد Static Architecture Review (Phase 12.2).
-- نفس الشكل بالضبط (Reviews/Categories/Findings/Files، Incremental،
-- Versioning) لكن محركين مستقلين تمامًا (Single Responsibility):
--   - Security Audit Engine: Authentication, Authorization, RLS,
--     API Security, Input Validation, Secrets, Environment (7 محاور).
--   - Database Integrity Engine: Database Structure, Query, Migration,
--     Data Integrity, Storage, Logging (6 محاور).
-- إضافات جداول جديدة كليًا، صفر تعديل على جداول Phase 12.1/12.2.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- SECURITY AUDIT ENGINE
-- ============================================================

create table if not exists public.security_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  engineering_review_id uuid references public.engineering_reviews(id) on delete set null,
  engineering_stage_id uuid references public.engineering_review_stages(id) on delete set null,
  version integer not null,
  status text not null default 'idle'
    check (status in ('idle','generating','ready','failed')),
  last_error text,
  repo_url text not null default '',
  repo_ref text not null default '',
  base_sha text,
  resolved_sha text,
  is_incremental boolean not null default false,
  total_files_in_repo integer not null default 0,
  files_analyzed_count integer not null default 0,
  files_reused_count integer not null default 0,
  file_tree jsonb not null default '[]'::jsonb,
  changed_files_snapshot jsonb not null default '[]'::jsonb,
  score_summary jsonb,
  category_count integer not null default 7,
  generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_security_reviews_project_version on public.security_reviews(project_id, version);
create index if not exists idx_security_reviews_project on public.security_reviews(project_id, created_at desc);
create unique index if not exists idx_security_reviews_one_active_per_project on public.security_reviews(project_id) where status = 'generating';

create or replace function public.touch_security_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_security_reviews_update_touch on public.security_reviews;
create trigger on_security_reviews_update_touch
  before update on public.security_reviews
  for each row execute procedure public.touch_security_reviews_updated_at();

create table if not exists public.security_review_categories (
  id uuid primary key default gen_random_uuid(),
  security_review_id uuid not null references public.security_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('authentication','authorization','rls','api_security','input_validation','secrets','environment')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_security_review_categories_review_key on public.security_review_categories(security_review_id, category_key);
create index if not exists idx_security_review_categories_project on public.security_review_categories(project_id);

create or replace function public.touch_security_review_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_security_review_categories_update_touch on public.security_review_categories;
create trigger on_security_review_categories_update_touch
  before update on public.security_review_categories
  for each row execute procedure public.touch_security_review_categories_updated_at();

-- code_snippet/description/impact/root_cause بتتخزن بعد Masking إجباري
-- (راجع lib/security-review/masking.ts) — أي قيمة شكلها Secret (مفتاح
-- API، Token، JWT، Connection String) بتتقطع وتتستبدل بـ [MASKED] قبل
-- أي عملية Insert، سواء المحور "secrets" أو أي محور تاني اكتشف Snippet
-- فيه سر بالصدفة.
create table if not exists public.security_review_findings (
  id uuid primary key default gen_random_uuid(),
  security_review_id uuid not null references public.security_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('authentication','authorization','rls','api_security','input_validation','secrets','environment')),
  finding_key text not null,
  severity text not null
    check (severity in ('critical','high','medium','low','info')),
  title text not null,
  description text not null default '',
  impact text not null default '',
  file_path text not null,
  component_name text,
  function_name text,
  class_name text,
  line_start integer,
  line_end integer,
  code_snippet text not null default '',
  root_cause text not null default '',
  attack_scenario text not null default '',
  recommended_fix text not null default '',
  patch_suggestion text not null default '',
  validation_steps jsonb not null default '[]'::jsonb,
  reference_links jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 100,
  carried_over boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_review_findings_review on public.security_review_findings(security_review_id, category_key);
create index if not exists idx_security_review_findings_project on public.security_review_findings(project_id);
create index if not exists idx_security_review_findings_file on public.security_review_findings(security_review_id, file_path);

create table if not exists public.security_review_files (
  id uuid primary key default gen_random_uuid(),
  security_review_id uuid not null references public.security_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_security_review_files_review_path on public.security_review_files(security_review_id, file_path);
create index if not exists idx_security_review_files_project on public.security_review_files(project_id);

-- ============================================================
-- DATABASE INTEGRITY ENGINE
-- ============================================================

create table if not exists public.database_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  engineering_review_id uuid references public.engineering_reviews(id) on delete set null,
  engineering_stage_id uuid references public.engineering_review_stages(id) on delete set null,
  version integer not null,
  status text not null default 'idle'
    check (status in ('idle','generating','ready','failed')),
  last_error text,
  repo_url text not null default '',
  repo_ref text not null default '',
  base_sha text,
  resolved_sha text,
  is_incremental boolean not null default false,
  total_files_in_repo integer not null default 0,
  files_analyzed_count integer not null default 0,
  files_reused_count integer not null default 0,
  file_tree jsonb not null default '[]'::jsonb,
  changed_files_snapshot jsonb not null default '[]'::jsonb,
  score_summary jsonb,
  category_count integer not null default 6,
  generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_database_reviews_project_version on public.database_reviews(project_id, version);
create index if not exists idx_database_reviews_project on public.database_reviews(project_id, created_at desc);
create unique index if not exists idx_database_reviews_one_active_per_project on public.database_reviews(project_id) where status = 'generating';

create or replace function public.touch_database_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_database_reviews_update_touch on public.database_reviews;
create trigger on_database_reviews_update_touch
  before update on public.database_reviews
  for each row execute procedure public.touch_database_reviews_updated_at();

create table if not exists public.database_review_categories (
  id uuid primary key default gen_random_uuid(),
  database_review_id uuid not null references public.database_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('database_structure','query','migration','data_integrity','storage','logging')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_database_review_categories_review_key on public.database_review_categories(database_review_id, category_key);
create index if not exists idx_database_review_categories_project on public.database_review_categories(project_id);

create or replace function public.touch_database_review_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_database_review_categories_update_touch on public.database_review_categories;
create trigger on_database_review_categories_update_touch
  before update on public.database_review_categories
  for each row execute procedure public.touch_database_review_categories_updated_at();

create table if not exists public.database_review_findings (
  id uuid primary key default gen_random_uuid(),
  database_review_id uuid not null references public.database_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('database_structure','query','migration','data_integrity','storage','logging')),
  finding_key text not null,
  severity text not null
    check (severity in ('critical','high','medium','low','info')),
  title text not null,
  description text not null default '',
  impact text not null default '',
  file_path text not null,
  component_name text,
  function_name text,
  class_name text,
  line_start integer,
  line_end integer,
  code_snippet text not null default '',
  root_cause text not null default '',
  attack_scenario text not null default '',
  recommended_fix text not null default '',
  patch_suggestion text not null default '',
  validation_steps jsonb not null default '[]'::jsonb,
  reference_links jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 100,
  carried_over boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_database_review_findings_review on public.database_review_findings(database_review_id, category_key);
create index if not exists idx_database_review_findings_project on public.database_review_findings(project_id);
create index if not exists idx_database_review_findings_file on public.database_review_findings(database_review_id, file_path);

create table if not exists public.database_review_files (
  id uuid primary key default gen_random_uuid(),
  database_review_id uuid not null references public.database_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_database_review_files_review_path on public.database_review_files(database_review_id, file_path);
create index if not exists idx_database_review_files_project on public.database_review_files(project_id);

-- ============================================================
-- Task Types جديدة (محور واحد لكل محرك — بدون توليف AI منفصل، نفس
-- قرار Phase 12.2: الدرجات النهائية تُحسب حسابيًا من الـ Findings).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('security_review_category', 'gemini', 'gemini-3.5-flash'),
  ('database_review_category', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط كل الجداول السابقة
-- ============================================================
alter table public.security_reviews enable row level security;
alter table public.security_review_categories enable row level security;
alter table public.security_review_findings enable row level security;
alter table public.security_review_files enable row level security;
alter table public.database_reviews enable row level security;
alter table public.database_review_categories enable row level security;
alter table public.database_review_findings enable row level security;
alter table public.database_review_files enable row level security;

create policy "internal_read_security_reviews" on public.security_reviews for select using (auth.uid() is not null);
create policy "internal_write_security_reviews" on public.security_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_security_review_categories" on public.security_review_categories for select using (auth.uid() is not null);
create policy "internal_write_security_review_categories" on public.security_review_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_security_review_findings" on public.security_review_findings for select using (auth.uid() is not null);
create policy "internal_write_security_review_findings" on public.security_review_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_security_review_files" on public.security_review_files for select using (auth.uid() is not null);
create policy "internal_write_security_review_files" on public.security_review_files for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_database_reviews" on public.database_reviews for select using (auth.uid() is not null);
create policy "internal_write_database_reviews" on public.database_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_database_review_categories" on public.database_review_categories for select using (auth.uid() is not null);
create policy "internal_write_database_review_categories" on public.database_review_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_database_review_findings" on public.database_review_findings for select using (auth.uid() is not null);
create policy "internal_write_database_review_findings" on public.database_review_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_database_review_files" on public.database_review_files for select using (auth.uid() is not null);
create policy "internal_write_database_review_files" on public.database_review_files for all using (auth.uid() is not null) with check (auth.uid() is not null);
