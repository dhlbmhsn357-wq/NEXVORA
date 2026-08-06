-- ============================================================
-- PM Operating System — 0058 Unified Prompt Framework
--
-- بنية تحتية موحّدة لتوليد البرومبتات عبر كل مراحل VELORA. جدول عام
-- واحد بيخزّن كل برومبت مُولَّد (النص + المصدر + الإصدار + درجة الجاهزية
-- + الـ Profile) لأي مرحلة — مش Generator واحد. كله additive.
-- ============================================================

-- 1) prompt_generations — سجل عام لأي برومبت مُولَّد + Versioning + Score
create table if not exists public.prompt_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  -- المرحلة (stage key) والـ Profile والهدف
  stage text not null,
  profile text not null,
  target text not null default 'gemini' check (target in ('gemini', 'claude_code')),
  version integer not null default 1,
  -- النص المُركّب النهائي + المصادر اللي اتبنى عليها
  prompt_text text not null,
  sources jsonb not null default '[]'::jsonb,
  ai_model text,
  -- درجة جاهزية البرومبت + أسباب الخصم
  readiness_score integer check (readiness_score between 0 and 100),
  readiness_deductions jsonb not null default '[]'::jsonb,
  -- lineage: لو ده نتيجة "Improve" لبرومبت سابق
  improved_from_id uuid references public.prompt_generations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prompt_generations_project_stage
  on public.prompt_generations(project_id, stage, version desc);
create index if not exists idx_prompt_generations_created
  on public.prompt_generations(created_at desc);

-- 2) مهمة AI جديدة: تحسين البرومبت (Improve) مع قفل الـ Scope
insert into public.ai_task_model_config (task_type, provider, model)
values ('prompt_refinement', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- 3) RLS — نفس السياسة الداخلية المبسطة
alter table public.prompt_generations enable row level security;

drop policy if exists "internal_read_prompt_generations" on public.prompt_generations;
create policy "internal_read_prompt_generations" on public.prompt_generations
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_prompt_generations" on public.prompt_generations;
create policy "internal_write_prompt_generations" on public.prompt_generations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- انتهى 0058 Unified Prompt Framework
-- ============================================================
