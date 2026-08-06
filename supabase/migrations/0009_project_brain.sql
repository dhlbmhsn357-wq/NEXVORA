-- ============================================================
-- Phase 5 — Project Brain: Database
-- إضافات بحتة، لا تلمس أي جدول موجود (بما فيه project_brain_entries
-- من phases سابقة — دي مصدر بيانات لـ Project Brain مش نفس الشيء).
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) project_brain — الحالة الحية الحالية (One-to-One مع المشروع)
-- ============================================================
create table if not exists public.project_brain (
  project_id uuid primary key references public.projects(id) on delete cascade,
  summary text not null default '',
  summary_is_manual boolean not null default false,
  -- ملخص مقترح من AI لما يكون فيه تعديل يدوي حالي (Conflict) — مستنّي قرار المستخدم
  pending_summary text,
  key_facts jsonb not null default '[]'::jsonb,
  pain_points jsonb not null default '[]'::jsonb,
  decisions_log jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  sync_status text not null default 'idle'
    check (sync_status in ('idle','syncing','failed')),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_project_brain_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_project_brain_update_touch on public.project_brain;
create trigger on_project_brain_update_touch
  before update on public.project_brain
  for each row execute procedure public.touch_project_brain_updated_at();

-- ============================================================
-- 2) project_brain_versions — سجل تاريخي، يُحفظ فقط عند تطبيق تغيير فعلي
-- ============================================================
create table if not exists public.project_brain_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  summary text,
  key_facts jsonb,
  pain_points jsonb,
  decisions_log jsonb,
  open_questions jsonb,
  reason text not null
    check (reason in (
      'meeting_processed','discovery_form_updated','manual_resync',
      'manual_edit','accepted_proposal'
    )),
  is_manual boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_brain_versions_project on public.project_brain_versions(project_id, version desc);

-- ============================================================
-- 3) Task Type جديد لمزامنة Project Brain
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('project_brain_sync', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.project_brain enable row level security;
alter table public.project_brain_versions enable row level security;

create policy "internal_read_project_brain" on public.project_brain
  for select using (auth.uid() is not null);
create policy "internal_write_project_brain" on public.project_brain
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_project_brain_versions" on public.project_brain_versions
  for select using (auth.uid() is not null);
create policy "internal_write_project_brain_versions" on public.project_brain_versions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
