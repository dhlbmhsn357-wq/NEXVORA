-- ============================================================
-- AI Code Execution Engine (Phase X — البرومت 2)
-- طبقة مستقلة تمامًا عن نظام AI Provider Layer الحالي (Gemini) — لا
-- تعدّل أي جدول قديم. Gemini يفضل مسؤول عن كل التحليل/التخطيط، وClaude
-- (النظام ده) مسؤول حصريًا عن تنفيذ الكود الفعلي عبر GitHub Contents
-- API (نفس أسلوب lib/github/client.ts الحالي — بدون git clone).
-- ============================================================

-- ============================================================
-- Execution Plans — خطة تنفيذ واحدة لكل محاولة تنفيذ Prototype Prompt.
-- ============================================================
create table if not exists public.execution_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prototype_prompt_version integer not null,
  repo_url text not null,
  repo_branch text not null default 'main',
  status text not null default 'idle'
    check (status in ('idle','planning','ready','executing','completed','failed')),
  total_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  failed_tasks integer not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_execution_plans_project on public.execution_plans(project_id, created_at desc);

-- ============================================================
-- Execution Tasks — مهام صغيرة مرتّبة، Claude بينفّذ واحدة في المرة.
-- ============================================================
create table if not exists public.execution_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.execution_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_order integer not null,
  title text not null,
  description text not null,
  target_file_hints jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed')),
  retry_count integer not null default 0,
  claude_response_summary text,
  files_modified jsonb not null default '[]'::jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,4),
  duration_seconds integer,
  last_error text,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, task_order)
);

create index if not exists idx_execution_tasks_plan on public.execution_tasks(plan_id, task_order);

-- ============================================================
-- QA Fix Loops — دورة تصحيح واحدة لكل مرحلة QA (Engineering/Accessibility)
-- بعد اكتمال التنفيذ. كل صف = محاولة واحدة (Attempt).
-- ============================================================
create table if not exists public.qa_fix_loops (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.execution_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  qa_stage text not null check (qa_stage in ('engineering_qa','accessibility_qa')),
  attempt_number integer not null,
  status text not null default 'running'
    check (status in ('running','fixed','failed','max_attempts_reached')),
  qa_reference_id uuid,
  findings_summary text,
  fix_prompt text,
  fix_task_id uuid references public.execution_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qa_fix_loops_plan on public.qa_fix_loops(plan_id, qa_stage, attempt_number);

-- ============================================================
-- Accessibility Scans — فحص Accessibility خفيف (axe-core، نفس بنية
-- Phase 4 التحتية في lib/production-validation/browser-runner.ts)
-- مستقل عن Engineering QA (اللي لسه معندوش مرحلة UI/UX حقيقية).
-- ============================================================
create table if not exists public.accessibility_scans (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.execution_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'running' check (status in ('running','ready','failed')),
  violations jsonb not null default '[]'::jsonb,
  violations_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accessibility_scans_plan on public.accessibility_scans(plan_id);

-- ============================================================
-- Release Candidates — البوابة النهائية: كل مراحل QA لازم تعدّي.
-- ============================================================
create table if not exists public.release_candidates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.execution_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','blocked','ready')),
  engineering_qa_passed boolean not null default false,
  accessibility_qa_passed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_release_candidates_plan on public.release_candidates(plan_id);

-- ============================================================
-- Touch triggers (نفس نمط كل جدول تاني في المشروع)
-- ============================================================
create or replace function public.touch_execution_plans_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_execution_plans_update_touch on public.execution_plans;
create trigger on_execution_plans_update_touch
  before update on public.execution_plans
  for each row execute procedure public.touch_execution_plans_updated_at();

create or replace function public.touch_execution_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_execution_tasks_update_touch on public.execution_tasks;
create trigger on_execution_tasks_update_touch
  before update on public.execution_tasks
  for each row execute procedure public.touch_execution_tasks_updated_at();

create or replace function public.touch_qa_fix_loops_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_qa_fix_loops_update_touch on public.qa_fix_loops;
create trigger on_qa_fix_loops_update_touch
  before update on public.qa_fix_loops
  for each row execute procedure public.touch_qa_fix_loops_updated_at();

create or replace function public.touch_accessibility_scans_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_accessibility_scans_update_touch on public.accessibility_scans;
create trigger on_accessibility_scans_update_touch
  before update on public.accessibility_scans
  for each row execute procedure public.touch_accessibility_scans_updated_at();

create or replace function public.touch_release_candidates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_release_candidates_update_touch on public.release_candidates;
create trigger on_release_candidates_update_touch
  before update on public.release_candidates
  for each row execute procedure public.touch_release_candidates_updated_at();

-- ============================================================
-- RLS — نفس نمط كل جدول داخلي تاني في المشروع (auth.uid() موجود = مسموح)
-- ============================================================
alter table public.execution_plans enable row level security;
alter table public.execution_tasks enable row level security;
alter table public.qa_fix_loops enable row level security;
alter table public.accessibility_scans enable row level security;
alter table public.release_candidates enable row level security;

create policy "internal_read_execution_plans" on public.execution_plans for select using (auth.uid() is not null);
create policy "internal_write_execution_plans" on public.execution_plans for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_execution_tasks" on public.execution_tasks for select using (auth.uid() is not null);
create policy "internal_write_execution_tasks" on public.execution_tasks for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_qa_fix_loops" on public.qa_fix_loops for select using (auth.uid() is not null);
create policy "internal_write_qa_fix_loops" on public.qa_fix_loops for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_accessibility_scans" on public.accessibility_scans for select using (auth.uid() is not null);
create policy "internal_write_accessibility_scans" on public.accessibility_scans for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_release_candidates" on public.release_candidates for select using (auth.uid() is not null);
create policy "internal_write_release_candidates" on public.release_candidates for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- Seed ai_task_model_config لمهمتَي Gemini الجديدتين (التخطيط + توليد Fix Prompt)
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('execution_plan_generation', 'gemini', 'gemini-3.5-flash'),
  ('fix_prompt_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;
