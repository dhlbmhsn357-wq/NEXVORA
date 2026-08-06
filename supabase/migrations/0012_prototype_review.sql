-- ============================================================
-- Phase 8 — Prototype Review Engine: Database
-- إضافات بحتة، لا تلمس أي جدول موجود.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) prototype_review — الصف الحي الحالي (نفس نمط prd/prototype_prompt)
-- gap_report jsonb بيحتوي الأقسام السبعة المطلوبة بالضبط، وكل عنصر
-- فيه ai_status/ai_evidence/ai_gap منفصلين عن pm_override (لا يُحذف
-- تقييم AI أبدًا عند التعديل اليدوي).
-- ============================================================
create table if not exists public.prototype_review (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  repo_url text not null,
  repo_ref text not null,
  reviewed_prd_version integer,
  reviewed_prompt_version integer,
  gap_report jsonb not null default '{}'::jsonb,
  completion_percentage numeric not null default 0,
  overall_status text not null default 'blocked'
    check (overall_status in ('ready','needs_changes','blocked')),
  version integer not null default 0,
  sync_status text not null default 'idle'
    check (sync_status in ('idle','reviewing','failed')),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prototype_review_project_unique on public.prototype_review(project_id);
-- Unique حاليًا (مراجعة حية واحدة لكل مشروع) — الجدول مصمم يسمح
-- بالتوسع لاحقًا لأكتر من Repository/مراجعة لكل مشروع بإزالة القيد فقط.

create or replace function public.touch_prototype_review_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prototype_review_update_touch on public.prototype_review;
create trigger on_prototype_review_update_touch
  before update on public.prototype_review
  for each row execute procedure public.touch_prototype_review_updated_at();

-- ============================================================
-- 2) prototype_review_versions — سجل تاريخي كامل، بدون حذف أي مراجعة
-- ============================================================
create table if not exists public.prototype_review_versions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.prototype_review(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  repo_url text,
  repo_ref text,
  reviewed_prd_version integer,
  reviewed_prompt_version integer,
  gap_report jsonb,
  completion_percentage numeric,
  overall_status text,
  reason text not null
    check (reason in ('review_run','manual_override')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prototype_review_versions_review on public.prototype_review_versions(review_id, version desc);
create index if not exists idx_prototype_review_versions_project on public.prototype_review_versions(project_id);

-- ============================================================
-- 3) Task Type جديد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('prototype_review', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.prototype_review enable row level security;
alter table public.prototype_review_versions enable row level security;

create policy "internal_read_prototype_review" on public.prototype_review
  for select using (auth.uid() is not null);
create policy "internal_write_prototype_review" on public.prototype_review
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prototype_review_versions" on public.prototype_review_versions
  for select using (auth.uid() is not null);
create policy "internal_write_prototype_review_versions" on public.prototype_review_versions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
