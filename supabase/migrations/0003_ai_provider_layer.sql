-- ============================================================
-- Phase 2 — AI Provider Layer: جداول البنية التحتية
-- إضافة بحتة، لا تلمس أي جدول من Phase 1.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) ai_task_model_config
-- إعدادات الموديل المستخدم لكل Task Type — تُعدَّل من صفحة الإعدادات.
-- الاختيار Manual فقط في هذه المرحلة (مش AI decision).
-- ============================================================
create table if not exists public.ai_task_model_config (
  task_type text primary key,
  provider text not null default 'gemini',
  model text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- قيم افتراضية معقولة لكل Task Type (حتى لو مش مستخدمة فعليًا الآن)
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('project_analysis', 'gemini', 'gemini-2.5-flash'),
  ('discovery_analysis', 'gemini', 'gemini-2.5-flash'),
  ('meeting_summary', 'gemini', 'gemini-2.5-flash'),
  ('prd_generation', 'gemini', 'gemini-2.5-flash'),
  ('user_story', 'gemini', 'gemini-2.5-flash'),
  ('prompt_generation', 'gemini', 'gemini-2.5-flash'),
  ('competitor_analysis', 'gemini', 'gemini-2.5-flash'),
  ('documentation', 'gemini', 'gemini-2.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- 2) ai_requests_log
-- Metadata فقط — ممنوع تخزين Prompt أو Response أو API Key هنا.
-- ============================================================
create table if not exists public.ai_requests_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  provider text not null,
  model_used text not null,
  task_type text not null,
  success boolean not null,
  latency_ms integer,
  error_code text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_requests_log_project on public.ai_requests_log(project_id);
create index if not exists idx_ai_requests_log_created on public.ai_requests_log(created_at);

-- ============================================================
-- Row Level Security — نفس نمط Phase 1: أي مستخدم داخلي مسجّل دخوله
-- يقدر يقرا/يعدّل. لا تعديل على سياسات الجداول الموجودة.
-- ============================================================
alter table public.ai_task_model_config enable row level security;
alter table public.ai_requests_log enable row level security;

create policy "internal_read_ai_task_model_config" on public.ai_task_model_config
  for select using (auth.uid() is not null);
create policy "internal_write_ai_task_model_config" on public.ai_task_model_config
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_ai_requests_log" on public.ai_requests_log
  for select using (auth.uid() is not null);
create policy "internal_write_ai_requests_log" on public.ai_requests_log
  for insert with check (auth.uid() is not null);
