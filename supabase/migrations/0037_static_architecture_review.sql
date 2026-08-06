-- ============================================================
-- Static Architecture Review Engine (Phase 12.2) — أول محرك مراجعة
-- هندسية حقيقي داخل Engineering QA (Phase 12.1). إضافات جداول جديدة
-- كليًا، صفر تعديل على جداول Phase 12.1 القائمة. مرتبط اختياريًا
-- بمرحلة "static_code_audit" في engineering_review_stages (لو اتشغّل
-- من جوّه EQA)، لكن الجداول نفسها Project-Scoped ومستقلة بالتاريخ
-- الكامل عبر الوقت — نفس فكرة engineering_reviews (تاريخ حقيقي، مش
-- صف حي واحد بس).
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) static_reviews — تشغيلة مراجعة واحدة (نسخة). كل مراجعة جديدة
-- بتاخد version أعلى — نفس منطق engineering_reviews.review_number.
-- base_sha بيسجّل الـ Commit اللي المراجعة السابقة اتعملت عنده، عشان
-- المراجعة الجاية تعرف تحلل الفرق بس (Incremental Analysis) بدل
-- إعادة قراءة الـ Repo كله من الصفر.
-- ============================================================
create table if not exists public.static_reviews (
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
  -- محتوى الملفات المتغيّرة/المُضافة بس (RepoFile[]) — بيتقرا مرة واحدة
  -- في init ويتخزّن هنا، عشان الـ 7 محاور مايعيدوش القراءة من GitHub كل
  -- واحد لوحده (نفس فكرة repo_snapshot في engineering_audits).
  changed_files_snapshot jsonb not null default '[]'::jsonb,
  score_summary jsonb,
  category_count integer not null default 7,
  generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_static_reviews_project_version on public.static_reviews(project_id, version);
create index if not exists idx_static_reviews_project on public.static_reviews(project_id, created_at desc);
-- مراجعة واحدة نشطة بالمشروع في نفس اللحظة — نفس فكرة القفل الجزئي في engineering_reviews.
create unique index if not exists idx_static_reviews_one_active_per_project on public.static_reviews(project_id) where status = 'generating';

create or replace function public.touch_static_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_static_reviews_update_touch on public.static_reviews;
create trigger on_static_reviews_update_touch
  before update on public.static_reviews
  for each row execute procedure public.touch_static_reviews_updated_at();

-- ============================================================
-- 2) static_review_categories — 7 صفوف ثابتة لكل مراجعة (Architecture,
-- Clean Code, SOLID, DRY/KISS, AI Code Smell, Naming, Documentation).
-- كل واحد بيتولّد في الخلفية لوحده بالتسلسل — نفس نمط
-- engineering_audit_categories بالظبط.
-- ============================================================
create table if not exists public.static_review_categories (
  id uuid primary key default gen_random_uuid(),
  static_review_id uuid not null references public.static_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('architecture','clean_code','solid','dry_kiss','ai_code_smell','naming','documentation')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  score integer,
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_static_review_categories_review_key on public.static_review_categories(static_review_id, category_key);
create index if not exists idx_static_review_categories_project on public.static_review_categories(project_id);

create or replace function public.touch_static_review_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_static_review_categories_update_touch on public.static_review_categories;
create trigger on_static_review_categories_update_touch
  before update on public.static_review_categories
  for each row execute procedure public.touch_static_review_categories_updated_at();

-- ============================================================
-- 3) static_review_findings — كل Finding فردي. finding_key نص ثابت
-- (category_key + file_path + عنوان مُطبَّع) بيُستخدم للمقارنة بين
-- مراجعتين (Issues Added/Fixed/Remaining) — مش UUID عشوائي كل مرة.
-- carried_over = true يعني الـ Finding ده منقول من مراجعة سابقة لملف
-- ملموسش (Incremental) مش نتيجة فحص جديد فعليًا في هذه المراجعة.
-- ============================================================
create table if not exists public.static_review_findings (
  id uuid primary key default gen_random_uuid(),
  static_review_id uuid not null references public.static_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('architecture','clean_code','solid','dry_kiss','ai_code_smell','naming','documentation')),
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
  recommended_fix text not null default '',
  patch_suggestion text not null default '',
  validation_steps jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 100,
  carried_over boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_static_review_findings_review on public.static_review_findings(static_review_id, category_key);
create index if not exists idx_static_review_findings_project on public.static_review_findings(project_id);
create index if not exists idx_static_review_findings_file on public.static_review_findings(static_review_id, file_path);

-- ============================================================
-- 4) static_review_files — لقطة كل ملف في هذه المراجعة (تغيّر ولا لأ)
-- — أساس الـ File Explorer وأساس معرفة الفرق للمراجعة الجاية.
-- ============================================================
create table if not exists public.static_review_files (
  id uuid primary key default gen_random_uuid(),
  static_review_id uuid not null references public.static_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  file_status text not null
    check (file_status in ('unchanged','added','modified','removed')),
  findings_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_static_review_files_review_path on public.static_review_files(static_review_id, file_path);
create index if not exists idx_static_review_files_project on public.static_review_files(project_id);

-- ============================================================
-- 5) Task Type جديد (تدقيق محور واحد — بدون مرحلة توليف AI منفصلة:
-- الدرجات النهائية والتقارير المُجمّعة بتتحسب حسابيًا من الـ Findings
-- مباشرة، مش بتوليد AI تاني — أكثر ثباتًا عبر المراجعات التدريجية،
-- وبيوفّر استدعاء AI كامل لكل مراجعة).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('static_review_category', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.static_reviews enable row level security;
alter table public.static_review_categories enable row level security;
alter table public.static_review_findings enable row level security;
alter table public.static_review_files enable row level security;

create policy "internal_read_static_reviews" on public.static_reviews
  for select using (auth.uid() is not null);
create policy "internal_write_static_reviews" on public.static_reviews
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_static_review_categories" on public.static_review_categories
  for select using (auth.uid() is not null);
create policy "internal_write_static_review_categories" on public.static_review_categories
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_static_review_findings" on public.static_review_findings
  for select using (auth.uid() is not null);
create policy "internal_write_static_review_findings" on public.static_review_findings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_static_review_files" on public.static_review_files
  for select using (auth.uid() is not null);
create policy "internal_write_static_review_files" on public.static_review_files
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
