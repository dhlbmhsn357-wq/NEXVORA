-- ============================================================
-- Phase 9 — Client Presentation Generator: Database
-- إضافات بحتة، لا تلمس project_brain أو prd أو prototype_review.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) client_presentations — الصف الحي الحالي (نفس نمط prd/prototype_prompt)
-- slides_content jsonb بـ 8 مفاتيح ثابتة (cover, problem, solution,
-- key_features, current_status, out_of_scope, next_steps, closing).
-- ============================================================
create table if not exists public.client_presentations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slides_content jsonb not null default '{}'::jsonb,
  generated_from_brain_version integer,
  generated_from_prd_version integer,
  generated_from_review_version integer,
  pptx_storage_path text,
  share_token text unique,
  version integer not null default 0,
  status text not null default 'idle'
    check (status in ('idle','generating','failed')),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_client_presentations_project_unique on public.client_presentations(project_id);
-- Unique حاليًا (عرض نشط واحد لكل مشروع) — الجدول مصمم يسمح بالتوسع
-- لاحقًا لأكتر من عرض لكل مشروع بإزالة القيد فقط.

create index if not exists idx_client_presentations_share_token on public.client_presentations(share_token);

create or replace function public.touch_client_presentations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_client_presentations_update_touch on public.client_presentations;
create trigger on_client_presentations_update_touch
  before update on public.client_presentations
  for each row execute procedure public.touch_client_presentations_updated_at();

-- ============================================================
-- 2) client_presentation_versions — سجل تاريخي كامل، بدون حذف أي نسخة
-- ============================================================
create table if not exists public.client_presentation_versions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.client_presentations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  slides_content jsonb,
  generated_from_brain_version integer,
  generated_from_prd_version integer,
  generated_from_review_version integer,
  reason text not null
    check (reason in ('full_generation','partial_regeneration','manual_edit')),
  slide_regenerated text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_presentation_versions_presentation on public.client_presentation_versions(presentation_id, version desc);
create index if not exists idx_client_presentation_versions_project on public.client_presentation_versions(project_id);

-- ============================================================
-- 3) Storage bucket خاص (private) لملفات PPTX
-- ============================================================
insert into storage.buckets (id, name, public)
values ('client-presentations', 'client-presentations', false)
on conflict (id) do nothing;

-- ============================================================
-- 4) Task Type جديد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('client_presentation_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة (صفحة المشاركة العامة
-- بتقرا عبر Service Role مباشرة، مش عبر سياسة RLS مفتوحة لغير المسجّلين)
-- ============================================================
alter table public.client_presentations enable row level security;
alter table public.client_presentation_versions enable row level security;

create policy "internal_read_client_presentations" on public.client_presentations
  for select using (auth.uid() is not null);
create policy "internal_write_client_presentations" on public.client_presentations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_client_presentation_versions" on public.client_presentation_versions
  for select using (auth.uid() is not null);
create policy "internal_write_client_presentation_versions" on public.client_presentation_versions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
