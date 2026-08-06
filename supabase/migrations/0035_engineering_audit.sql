-- ============================================================
-- Engineering-Grade Technical Handoff Audit — إضافات بحتة، جداول
-- جديدة كليًا بجانب developer_handoff الحالي (الحزمة الخفيفة القديمة
-- تفضل شغالة زي ما هي من غير أي لمس). النظام ده أعمق بكتير: بيقرا
-- الـ Repository فعليًا (زي Prototype Review) ويطلع تقرير هندسي مفصّل
-- بـ 6 محاور تدقيق + لوحة قيادة تنفيذية + خارطة طريق.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) engineering_audits — الصف الحي الحالي (نفس نمط باقي الجداول)
-- repo_snapshot: بيتقرا مرة واحدة بس (init stage) ويتخزّن هنا، عشان
-- الـ 6 محاور مايعيدوش قراءة GitHub كل واحد لوحده (تكلفة ووقت أكبر بكتير).
-- executive_scores وroadmap بيتملّوا في مرحلة التوليف الأخيرة بس.
-- ============================================================
create table if not exists public.engineering_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null default 0,
  status text not null default 'idle'
    check (status in ('idle','generating','ready','failed')),
  last_error text,
  repo_url text not null default '',
  repo_ref text not null default '',
  resolved_sha text,
  repo_snapshot jsonb,
  category_count integer not null default 6,
  executive_scores jsonb,
  roadmap jsonb,
  generated_from_prd_version integer,
  generated_from_review_version integer,
  generated_from_brain_version integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_engineering_audits_project_unique on public.engineering_audits(project_id);

create or replace function public.touch_engineering_audits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_engineering_audits_update_touch on public.engineering_audits;
create trigger on_engineering_audits_update_touch
  before update on public.engineering_audits
  for each row execute procedure public.touch_engineering_audits_updated_at();

-- ============================================================
-- 2) engineering_audit_categories — 6 صفوف ثابتة لكل تشغيلة تدقيق
-- (architecture, security, database, performance, code_quality,
-- prd_compliance) — كل واحد بيتولّد في الخلفية لوحده بالتسلسل.
-- ============================================================
create table if not exists public.engineering_audit_categories (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.engineering_audits(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('architecture','security','database','performance','code_quality','prd_compliance')),
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  summary text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_engineering_audit_categories_audit_key on public.engineering_audit_categories(audit_id, category_key);
create index if not exists idx_engineering_audit_categories_project on public.engineering_audit_categories(project_id);

create or replace function public.touch_engineering_audit_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_engineering_audit_categories_update_touch on public.engineering_audit_categories;
create trigger on_engineering_audit_categories_update_touch
  before update on public.engineering_audit_categories
  for each row execute procedure public.touch_engineering_audit_categories_updated_at();

-- ============================================================
-- 3) engineering_audit_findings — كل Finding فردي (نتيجة تدقيق محور
-- واحد). كل Finding لازم يحمل دليل من الكود الفعلي (file_path +
-- line_start/line_end + code_snippet مقتبس حرفيًا) — مفيش استنتاج
-- بدون دليل. بيتمسح ويتجدد لكل محور عند إعادة توليده.
-- ============================================================
create table if not exists public.engineering_audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.engineering_audits(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_key text not null
    check (category_key in ('architecture','security','database','performance','code_quality','prd_compliance')),
  severity text not null
    check (severity in ('critical','high','medium','low')),
  title text not null,
  file_path text not null,
  component_name text,
  function_name text,
  class_name text,
  line_start integer,
  line_end integer,
  code_snippet text not null default '',
  reason text not null default '',
  business_impact text not null default '',
  technical_impact jsonb not null default '[]'::jsonb,
  recommended_fix text not null default '',
  estimated_complexity text not null default 'M'
    check (estimated_complexity in ('XS','S','M','L','XL')),
  estimated_hours numeric,
  breaking_changes boolean not null default false,
  dependencies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_engineering_audit_findings_audit on public.engineering_audit_findings(audit_id, category_key);
create index if not exists idx_engineering_audit_findings_project on public.engineering_audit_findings(project_id);

-- ============================================================
-- 4) Task Types جديدة (تدقيق محور + توليف نهائي)
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('engineering_audit_category', 'gemini', 'gemini-3.5-flash'),
  ('engineering_audit_synthesis', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.engineering_audits enable row level security;
alter table public.engineering_audit_categories enable row level security;
alter table public.engineering_audit_findings enable row level security;

create policy "internal_read_engineering_audits" on public.engineering_audits
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_audits" on public.engineering_audits
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_engineering_audit_categories" on public.engineering_audit_categories
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_audit_categories" on public.engineering_audit_categories
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_engineering_audit_findings" on public.engineering_audit_findings
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_audit_findings" on public.engineering_audit_findings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
