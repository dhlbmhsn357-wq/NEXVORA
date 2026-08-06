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
