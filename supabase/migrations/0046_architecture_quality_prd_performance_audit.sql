-- ============================================================
-- Architecture / Code Quality / PRD Compliance / Performance Audit
-- (EngQA-Merge) — أربع محركات فحص حقيقية إضافية جوّه Engineering QA،
-- بنفس شكل Security/Database بالضبط (Phase 12.3): Reviews/Categories/
-- Findings/Files، Incremental، Versioning، صفر تكرار منطق — بس محركات
-- مستقلة (Single Responsibility) لكل محور.
--
-- السبب: نظام "Engineering Audit" القديم (Legacy) كان بيغطي المحاور
-- دي بتخمين AI شامل (نسبة مئوية واحدة من مطالبة توليف)، مش بفحص حقيقي
-- بدليل من الكود زي باقي Engineering QA. المحاور دي بتحل محله بنفس
-- منهجية Engineering QA الأدق (Diff حقيقي + Findings بدليل)، تمهيدًا
-- لحذف النظام القديم بالكامل بعد ما التغطية تكتمل.
--
--   - Architecture Engine: Layering, Coupling, Scalability,
--     Module Boundaries, Dependency Management, API Design (6 محاور).
--   - Code Quality Engine: Readability, Duplication, Error Handling,
--     Testing Coverage, Naming Consistency, Complexity (6 محاور).
--   - PRD Compliance Engine: Functional Requirements Coverage,
--     Non-Functional Requirements, Scope Adherence, Acceptance
--     Criteria (4 محاور) — الوحيد اللي بيحتاج محتوى PRD كمان مش الكود بس.
--   - Performance Engine: Query Performance, Bundle Size, Caching,
--     Render Performance, N+1 Patterns, Async Patterns (6 محاور).
--
-- إضافات جداول جديدة كليًا، صفر تعديل على جداول أي مرحلة سابقة.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- ARCHITECTURE AUDIT ENGINE
-- ============================================================

create table if not exists public.architecture_reviews (
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

create unique index if not exists idx_architecture_reviews_project_version on public.architecture_reviews(project_id, version);
create index if not exists idx_architecture_reviews_project on public.architecture_reviews(project_id, created_at desc);
create unique index if not exists idx_architecture_reviews_one_active_per_project on public.architecture_reviews(project_id) where status = 'generating';

create or replace function public.touch_architecture_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_architecture_reviews_update_touch on public.architecture_reviews;
create trigger on_architecture_reviews_update_touch
  before update on public.architecture_reviews
  for each row execute procedure public.touch_architecture_reviews_updated_at();

create table if not exists public.architecture_review_categories (
  id uuid primary key default gen_random_uuid(),
  architecture_review_id uuid not null references public.architecture_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('layering','coupling','scalability','module_boundaries','dependency_management','api_design')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_architecture_review_categories_review_key on public.architecture_review_categories(architecture_review_id, category_key);
create index if not exists idx_architecture_review_categories_project on public.architecture_review_categories(project_id);

create or replace function public.touch_architecture_review_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_architecture_review_categories_update_touch on public.architecture_review_categories;
create trigger on_architecture_review_categories_update_touch
  before update on public.architecture_review_categories
  for each row execute procedure public.touch_architecture_review_categories_updated_at();

create table if not exists public.architecture_review_findings (
  id uuid primary key default gen_random_uuid(),
  architecture_review_id uuid not null references public.architecture_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('layering','coupling','scalability','module_boundaries','dependency_management','api_design')),
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

create index if not exists idx_architecture_review_findings_review on public.architecture_review_findings(architecture_review_id, category_key);
create index if not exists idx_architecture_review_findings_project on public.architecture_review_findings(project_id);
create index if not exists idx_architecture_review_findings_file on public.architecture_review_findings(architecture_review_id, file_path);

create table if not exists public.architecture_review_files (
  id uuid primary key default gen_random_uuid(),
  architecture_review_id uuid not null references public.architecture_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_architecture_review_files_review_path on public.architecture_review_files(architecture_review_id, file_path);
create index if not exists idx_architecture_review_files_project on public.architecture_review_files(project_id);

-- ============================================================
-- CODE QUALITY AUDIT ENGINE
-- ============================================================

create table if not exists public.code_quality_reviews (
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

create unique index if not exists idx_code_quality_reviews_project_version on public.code_quality_reviews(project_id, version);
create index if not exists idx_code_quality_reviews_project on public.code_quality_reviews(project_id, created_at desc);
create unique index if not exists idx_code_quality_reviews_one_active_per_project on public.code_quality_reviews(project_id) where status = 'generating';

create or replace function public.touch_code_quality_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_code_quality_reviews_update_touch on public.code_quality_reviews;
create trigger on_code_quality_reviews_update_touch
  before update on public.code_quality_reviews
  for each row execute procedure public.touch_code_quality_reviews_updated_at();

create table if not exists public.code_quality_review_categories (
  id uuid primary key default gen_random_uuid(),
  code_quality_review_id uuid not null references public.code_quality_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('readability','duplication','error_handling','testing_coverage','naming_consistency','complexity')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_code_quality_review_categories_review_key on public.code_quality_review_categories(code_quality_review_id, category_key);
create index if not exists idx_code_quality_review_categories_project on public.code_quality_review_categories(project_id);

create or replace function public.touch_code_quality_review_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_code_quality_review_categories_update_touch on public.code_quality_review_categories;
create trigger on_code_quality_review_categories_update_touch
  before update on public.code_quality_review_categories
  for each row execute procedure public.touch_code_quality_review_categories_updated_at();

create table if not exists public.code_quality_review_findings (
  id uuid primary key default gen_random_uuid(),
  code_quality_review_id uuid not null references public.code_quality_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('readability','duplication','error_handling','testing_coverage','naming_consistency','complexity')),
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

create index if not exists idx_code_quality_review_findings_review on public.code_quality_review_findings(code_quality_review_id, category_key);
create index if not exists idx_code_quality_review_findings_project on public.code_quality_review_findings(project_id);
create index if not exists idx_code_quality_review_findings_file on public.code_quality_review_findings(code_quality_review_id, file_path);

create table if not exists public.code_quality_review_files (
  id uuid primary key default gen_random_uuid(),
  code_quality_review_id uuid not null references public.code_quality_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_code_quality_review_files_review_path on public.code_quality_review_files(code_quality_review_id, file_path);
create index if not exists idx_code_quality_review_files_project on public.code_quality_review_files(project_id);

-- ============================================================
-- PRD COMPLIANCE AUDIT ENGINE
-- ============================================================

create table if not exists public.prd_compliance_reviews (
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
  category_count integer not null default 4,
  generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prd_compliance_reviews_project_version on public.prd_compliance_reviews(project_id, version);
create index if not exists idx_prd_compliance_reviews_project on public.prd_compliance_reviews(project_id, created_at desc);
create unique index if not exists idx_prd_compliance_reviews_one_active_per_project on public.prd_compliance_reviews(project_id) where status = 'generating';

create or replace function public.touch_prd_compliance_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prd_compliance_reviews_update_touch on public.prd_compliance_reviews;
create trigger on_prd_compliance_reviews_update_touch
  before update on public.prd_compliance_reviews
  for each row execute procedure public.touch_prd_compliance_reviews_updated_at();

create table if not exists public.prd_compliance_review_categories (
  id uuid primary key default gen_random_uuid(),
  prd_compliance_review_id uuid not null references public.prd_compliance_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('functional_requirements_coverage','non_functional_requirements','scope_adherence','acceptance_criteria')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prd_compliance_review_categories_review_key on public.prd_compliance_review_categories(prd_compliance_review_id, category_key);
create index if not exists idx_prd_compliance_review_categories_project on public.prd_compliance_review_categories(project_id);

create or replace function public.touch_prd_compliance_review_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prd_compliance_review_categories_update_touch on public.prd_compliance_review_categories;
create trigger on_prd_compliance_review_categories_update_touch
  before update on public.prd_compliance_review_categories
  for each row execute procedure public.touch_prd_compliance_review_categories_updated_at();

create table if not exists public.prd_compliance_review_findings (
  id uuid primary key default gen_random_uuid(),
  prd_compliance_review_id uuid not null references public.prd_compliance_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('functional_requirements_coverage','non_functional_requirements','scope_adherence','acceptance_criteria')),
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

create index if not exists idx_prd_compliance_review_findings_review on public.prd_compliance_review_findings(prd_compliance_review_id, category_key);
create index if not exists idx_prd_compliance_review_findings_project on public.prd_compliance_review_findings(project_id);
create index if not exists idx_prd_compliance_review_findings_file on public.prd_compliance_review_findings(prd_compliance_review_id, file_path);

create table if not exists public.prd_compliance_review_files (
  id uuid primary key default gen_random_uuid(),
  prd_compliance_review_id uuid not null references public.prd_compliance_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_prd_compliance_review_files_review_path on public.prd_compliance_review_files(prd_compliance_review_id, file_path);
create index if not exists idx_prd_compliance_review_files_project on public.prd_compliance_review_files(project_id);

-- ============================================================
-- PERFORMANCE AUDIT ENGINE
-- ============================================================

create table if not exists public.performance_reviews (
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

create unique index if not exists idx_performance_reviews_project_version on public.performance_reviews(project_id, version);
create index if not exists idx_performance_reviews_project on public.performance_reviews(project_id, created_at desc);
create unique index if not exists idx_performance_reviews_one_active_per_project on public.performance_reviews(project_id) where status = 'generating';

create or replace function public.touch_performance_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_performance_reviews_update_touch on public.performance_reviews;
create trigger on_performance_reviews_update_touch
  before update on public.performance_reviews
  for each row execute procedure public.touch_performance_reviews_updated_at();

create table if not exists public.performance_review_categories (
  id uuid primary key default gen_random_uuid(),
  performance_review_id uuid not null references public.performance_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('query_performance','bundle_size','caching','render_performance','n_plus_one','async_patterns')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_performance_review_categories_review_key on public.performance_review_categories(performance_review_id, category_key);
create index if not exists idx_performance_review_categories_project on public.performance_review_categories(project_id);

create or replace function public.touch_performance_review_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_performance_review_categories_update_touch on public.performance_review_categories;
create trigger on_performance_review_categories_update_touch
  before update on public.performance_review_categories
  for each row execute procedure public.touch_performance_review_categories_updated_at();

create table if not exists public.performance_review_findings (
  id uuid primary key default gen_random_uuid(),
  performance_review_id uuid not null references public.performance_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('query_performance','bundle_size','caching','render_performance','n_plus_one','async_patterns')),
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

create index if not exists idx_performance_review_findings_review on public.performance_review_findings(performance_review_id, category_key);
create index if not exists idx_performance_review_findings_project on public.performance_review_findings(project_id);
create index if not exists idx_performance_review_findings_file on public.performance_review_findings(performance_review_id, file_path);

create table if not exists public.performance_review_files (
  id uuid primary key default gen_random_uuid(),
  performance_review_id uuid not null references public.performance_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_performance_review_files_review_path on public.performance_review_files(performance_review_id, file_path);
create index if not exists idx_performance_review_files_project on public.performance_review_files(project_id);

-- ============================================================
-- Task Types جديدة (محور واحد لكل محرك — نفس قرار Phase 12.2/12.3:
-- الدرجات النهائية تُحسب حسابيًا من الـ Findings، بدون توليف AI منفصل).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('architecture_review_category', 'gemini', 'gemini-3.5-flash'),
  ('code_quality_review_category', 'gemini', 'gemini-3.5-flash'),
  ('prd_compliance_review_category', 'gemini', 'gemini-3.5-flash'),
  ('performance_review_category', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط كل الجداول السابقة
-- ============================================================
alter table public.architecture_reviews enable row level security;
alter table public.architecture_review_categories enable row level security;
alter table public.architecture_review_findings enable row level security;
alter table public.architecture_review_files enable row level security;
alter table public.code_quality_reviews enable row level security;
alter table public.code_quality_review_categories enable row level security;
alter table public.code_quality_review_findings enable row level security;
alter table public.code_quality_review_files enable row level security;
alter table public.prd_compliance_reviews enable row level security;
alter table public.prd_compliance_review_categories enable row level security;
alter table public.prd_compliance_review_findings enable row level security;
alter table public.prd_compliance_review_files enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.performance_review_categories enable row level security;
alter table public.performance_review_findings enable row level security;
alter table public.performance_review_files enable row level security;

create policy "internal_read_architecture_reviews" on public.architecture_reviews for select using (auth.uid() is not null);
create policy "internal_write_architecture_reviews" on public.architecture_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_architecture_review_categories" on public.architecture_review_categories for select using (auth.uid() is not null);
create policy "internal_write_architecture_review_categories" on public.architecture_review_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_architecture_review_findings" on public.architecture_review_findings for select using (auth.uid() is not null);
create policy "internal_write_architecture_review_findings" on public.architecture_review_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_architecture_review_files" on public.architecture_review_files for select using (auth.uid() is not null);
create policy "internal_write_architecture_review_files" on public.architecture_review_files for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_code_quality_reviews" on public.code_quality_reviews for select using (auth.uid() is not null);
create policy "internal_write_code_quality_reviews" on public.code_quality_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_code_quality_review_categories" on public.code_quality_review_categories for select using (auth.uid() is not null);
create policy "internal_write_code_quality_review_categories" on public.code_quality_review_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_code_quality_review_findings" on public.code_quality_review_findings for select using (auth.uid() is not null);
create policy "internal_write_code_quality_review_findings" on public.code_quality_review_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_code_quality_review_files" on public.code_quality_review_files for select using (auth.uid() is not null);
create policy "internal_write_code_quality_review_files" on public.code_quality_review_files for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prd_compliance_reviews" on public.prd_compliance_reviews for select using (auth.uid() is not null);
create policy "internal_write_prd_compliance_reviews" on public.prd_compliance_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_prd_compliance_review_categories" on public.prd_compliance_review_categories for select using (auth.uid() is not null);
create policy "internal_write_prd_compliance_review_categories" on public.prd_compliance_review_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_prd_compliance_review_findings" on public.prd_compliance_review_findings for select using (auth.uid() is not null);
create policy "internal_write_prd_compliance_review_findings" on public.prd_compliance_review_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_prd_compliance_review_files" on public.prd_compliance_review_files for select using (auth.uid() is not null);
create policy "internal_write_prd_compliance_review_files" on public.prd_compliance_review_files for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_performance_reviews" on public.performance_reviews for select using (auth.uid() is not null);
create policy "internal_write_performance_reviews" on public.performance_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_performance_review_categories" on public.performance_review_categories for select using (auth.uid() is not null);
create policy "internal_write_performance_review_categories" on public.performance_review_categories for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_performance_review_findings" on public.performance_review_findings for select using (auth.uid() is not null);
create policy "internal_write_performance_review_findings" on public.performance_review_findings for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "internal_read_performance_review_files" on public.performance_review_files for select using (auth.uid() is not null);
create policy "internal_write_performance_review_files" on public.performance_review_files for all using (auth.uid() is not null) with check (auth.uid() is not null);
