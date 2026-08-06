-- ============================================================
-- Prototype Prompt Pipeline (V2) — إضافات بحتة، جداول جديدة كليًا
-- بجانب prototype_prompt/prototype_prompt_versions الحاليين (اللي ليهم
-- unique index على project_id يمنع أكتر من Prompt واحد لكل مشروع —
-- النظام القديم بالـ Single Prompt يفضل شغال زي ما هو من غير أي لمس).
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) prototype_prompt_plans — خطة تنفيذ واحدة نشطة لكل مشروع (Row حي،
-- نفس نمط الجداول التانية). "modules" بيحتفظ بمخرجات AI الخام لخطة
-- التقسيم (index/title/summary/depends_on) قبل ما تتحول لصفوف Stage.
-- ============================================================
create table if not exists public.prototype_prompt_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null default 0,
  target_tool text not null default 'general',
  project_size text
    check (project_size in ('small','medium','enterprise')),
  execution_summary text not null default '',
  modules jsonb not null default '[]'::jsonb,
  stage_count integer not null default 0,
  status text not null default 'idle'
    check (status in ('idle','generating','ready','failed')),
  last_error text,
  generated_from_prd_version integer,
  generated_from_brain_version integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prototype_prompt_plans_project_unique on public.prototype_prompt_plans(project_id);

create or replace function public.touch_prototype_prompt_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prototype_prompt_plans_update_touch on public.prototype_prompt_plans;
create trigger on_prototype_prompt_plans_update_touch
  before update on public.prototype_prompt_plans
  for each row execute procedure public.touch_prototype_prompt_plans_updated_at();

-- ============================================================
-- 2) prototype_prompt_stages — N صف لكل خطة، صف لكل Prompt مستقل
-- كامل في السلسلة. بيتولدوا بالترتيب (Stage N بعد ما N-1 يخلص).
-- ============================================================
create table if not exists public.prototype_prompt_stages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.prototype_prompt_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_index integer not null,
  title text not null default '',
  summary text not null default '',
  depends_on jsonb not null default '[]'::jsonb,
  content text,
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prototype_prompt_stages_plan_index on public.prototype_prompt_stages(plan_id, stage_index);
create index if not exists idx_prototype_prompt_stages_project on public.prototype_prompt_stages(project_id);

create or replace function public.touch_prototype_prompt_stages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prototype_prompt_stages_update_touch on public.prototype_prompt_stages;
create trigger on_prototype_prompt_stages_update_touch
  before update on public.prototype_prompt_stages
  for each row execute procedure public.touch_prototype_prompt_stages_updated_at();

-- ============================================================
-- 3) Task Types جديدة (تخطيط + توليد Stage) — منفصلين عشان يقدروا
-- ياخدوا موديل/إعدادات مختلفة لاحقًا لو احتجنا (مثلاً موديل أقوى للتخطيط).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('prototype_prompt_pipeline_planning', 'gemini', 'gemini-3.5-flash'),
  ('prototype_prompt_pipeline_stage', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.prototype_prompt_plans enable row level security;
alter table public.prototype_prompt_stages enable row level security;

create policy "internal_read_prototype_prompt_plans" on public.prototype_prompt_plans
  for select using (auth.uid() is not null);
create policy "internal_write_prototype_prompt_plans" on public.prototype_prompt_plans
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prototype_prompt_stages" on public.prototype_prompt_stages
  for select using (auth.uid() is not null);
create policy "internal_write_prototype_prompt_stages" on public.prototype_prompt_stages
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
