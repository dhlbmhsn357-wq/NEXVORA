-- ============================================================
-- Phase 6 — AI Generated PRD: Database
-- إضافات بحتة، لا تلمس أي جدول موجود.
-- ملاحظة: PROJECT_ANALYSIS's task_type 'prd_generation' وصف افتراضي
-- له أصلاً من Phase 2 (ai_task_model_config) — مفيش داعي لإدخال جديد.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) prd — الصف الحي الحالي (نفس نمط project_brain: FK عادي مش
-- Unique، عشان يسمح بتوسّع مستقبلي، بس المرحلة دي بتدير PRD واحد
-- نشط لكل مشروع فقط)
-- ============================================================
create table if not exists public.prd (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  overview text not null default '',
  problem_statement text not null default '',
  goals jsonb not null default '[]'::jsonb,
  out_of_scope jsonb not null default '[]'::jsonb,
  target_users jsonb not null default '[]'::jsonb,
  user_stories jsonb not null default '[]'::jsonb,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  functional_requirements jsonb not null default '[]'::jsonb,
  non_functional_requirements jsonb not null default '[]'::jsonb,
  risks_assumptions jsonb not null default '[]'::jsonb,
  success_metrics jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  status text not null default 'draft',
  generated_from_brain_version integer,
  sync_status text not null default 'idle'
    check (sync_status in ('idle','generating','failed')),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prd_project_unique on public.prd(project_id);
-- Unique فعليًا في هذه المرحلة (PRD واحد نشط لكل مشروع) — الجدول نفسه
-- مصمم يسمح بالتوسع لاحقًا بإزالة القيد ده من غير Migration جديدة للأعمدة.

create or replace function public.touch_prd_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prd_update_touch on public.prd;
create trigger on_prd_update_touch
  before update on public.prd
  for each row execute procedure public.touch_prd_updated_at();

-- ============================================================
-- 2) prd_versions — سجل تاريخي كامل، بدون حذف أي نسخة سابقة
-- ============================================================
create table if not exists public.prd_versions (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references public.prd(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  overview text,
  problem_statement text,
  goals jsonb,
  out_of_scope jsonb,
  target_users jsonb,
  user_stories jsonb,
  acceptance_criteria jsonb,
  functional_requirements jsonb,
  non_functional_requirements jsonb,
  risks_assumptions jsonb,
  success_metrics jsonb,
  status text,
  generated_from_brain_version integer,
  reason text not null
    check (reason in ('full_generation','partial_regeneration','manual_edit','conflict_replace')),
  section_regenerated text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prd_versions_prd on public.prd_versions(prd_id, version desc);
create index if not exists idx_prd_versions_project on public.prd_versions(project_id);

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.prd enable row level security;
alter table public.prd_versions enable row level security;

create policy "internal_read_prd" on public.prd
  for select using (auth.uid() is not null);
create policy "internal_write_prd" on public.prd
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prd_versions" on public.prd_versions
  for select using (auth.uid() is not null);
create policy "internal_write_prd_versions" on public.prd_versions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
