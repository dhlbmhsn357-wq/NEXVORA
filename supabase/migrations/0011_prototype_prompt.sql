-- ============================================================
-- Phase 7 — Prototype Prompt Generator: Database
-- إضافات بحتة، لا تلمس أي جدول موجود.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) prototype_prompt — الصف الحي الحالي (نفس نمط prd)
-- content مقسّم لـ 15 عمود نصي (قسم لكل واحد) بدل نص Markdown خام
-- واحد، عشان يسمح بـ Validation دقيق وتعديل/إعادة توليد كل قسم لوحده.
-- الترتيب النهائي بيتحدد في طبقة العرض/Export، مش هنا.
-- ============================================================
create table if not exists public.prototype_prompt (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target_tool text not null default 'general',
  context text not null default '',
  project_goal text not null default '',
  technical_context text not null default '',
  required_features text not null default '',
  functional_requirements text not null default '',
  user_stories text not null default '',
  acceptance_criteria text not null default '',
  edge_cases text not null default '',
  constraints text not null default '',
  out_of_scope text not null default '',
  architecture_notes text not null default '',
  ui_guidelines text not null default '',
  code_quality_requirements text not null default '',
  testing_expectations text not null default '',
  definition_of_done text not null default '',
  version integer not null default 0,
  status text not null default 'draft',
  generated_from_prd_version integer,
  generated_from_brain_version integer,
  sync_status text not null default 'idle'
    check (sync_status in ('idle','generating','failed')),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prototype_prompt_project_unique on public.prototype_prompt(project_id);
-- Unique حاليًا (Prompt نشط واحد لكل مشروع) — الجدول مصمم يسمح بالتوسع
-- لاحقًا لأكتر من Prompt لكل مشروع بإزالة القيد ده فقط.

create or replace function public.touch_prototype_prompt_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prototype_prompt_update_touch on public.prototype_prompt;
create trigger on_prototype_prompt_update_touch
  before update on public.prototype_prompt
  for each row execute procedure public.touch_prototype_prompt_updated_at();

-- ============================================================
-- 2) prototype_prompt_versions — سجل تاريخي كامل، بدون حذف أي نسخة
-- ============================================================
create table if not exists public.prototype_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prototype_prompt(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  target_tool text,
  context text,
  project_goal text,
  technical_context text,
  required_features text,
  functional_requirements text,
  user_stories text,
  acceptance_criteria text,
  edge_cases text,
  constraints text,
  out_of_scope text,
  architecture_notes text,
  ui_guidelines text,
  code_quality_requirements text,
  testing_expectations text,
  definition_of_done text,
  status text,
  generated_from_prd_version integer,
  generated_from_brain_version integer,
  reason text not null
    check (reason in ('full_generation','partial_regeneration','manual_edit','conflict_replace')),
  section_regenerated text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prototype_prompt_versions_prompt on public.prototype_prompt_versions(prompt_id, version desc);
create index if not exists idx_prototype_prompt_versions_project on public.prototype_prompt_versions(project_id);

-- ============================================================
-- 3) Task Type جديد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('prototype_prompt_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.prototype_prompt enable row level security;
alter table public.prototype_prompt_versions enable row level security;

create policy "internal_read_prototype_prompt" on public.prototype_prompt
  for select using (auth.uid() is not null);
create policy "internal_write_prototype_prompt" on public.prototype_prompt
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prototype_prompt_versions" on public.prototype_prompt_versions
  for select using (auth.uid() is not null);
create policy "internal_write_prototype_prompt_versions" on public.prototype_prompt_versions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
