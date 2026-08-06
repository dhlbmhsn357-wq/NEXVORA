-- ============================================================
-- PM Operating System — 0029 AI Meeting Preparation (Phase X)
--
-- غرفة تجهيز الـ PM قبل اجتماع الاكتشاف: 13 قسمًا مستقلًا (تُبنى كل
-- واحدة بمولّدها الخاص، مش Prompt واحد ضخم)، كل قسم قابل لإعادة التوليد
-- والتعديل اليدوي بشكل منفصل. إضافي بحت، idempotent.
-- ============================================================

-- ============================================================
-- 1) meeting_preparations — وثيقة واحدة لكل مشروع (بتتحدّث في مكانها)
-- ============================================================
create table if not exists public.meeting_preparations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,

  based_on_analysis_id uuid references public.discovery_analyses(id) on delete set null,
  based_on_brain_document_id uuid references public.project_brain_documents(id) on delete set null,

  -- كل قسم = { content, meta: { status, confidence, source, last_updated } }
  sections jsonb not null default '{}'::jsonb,

  overall_confidence int not null default 0
    check (overall_confidence >= 0 and overall_confidence <= 100),

  status text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'failed')),

  version int not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meeting_prep_project on public.meeting_preparations(project_id);

-- ============================================================
-- 2) meeting_preparation_edits — Audit Trail لكل تعديل يدوي على قسم
-- ============================================================
create table if not exists public.meeting_preparation_edits (
  id uuid primary key default gen_random_uuid(),
  meeting_preparation_id uuid not null references public.meeting_preparations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  section_key text not null,
  before_value jsonb,
  after_value jsonb not null,
  reason text,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz not null default now()
);

create index if not exists idx_meeting_prep_edits_doc
  on public.meeting_preparation_edits(meeting_preparation_id, edited_at desc);

-- ============================================================
-- 3) RLS — نفس سياسة النظام
-- ============================================================
alter table public.meeting_preparations enable row level security;
alter table public.meeting_preparation_edits enable row level security;

drop policy if exists "internal_read_meeting_prep" on public.meeting_preparations;
create policy "internal_read_meeting_prep" on public.meeting_preparations
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_prep" on public.meeting_preparations;
create policy "internal_write_meeting_prep" on public.meeting_preparations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_meeting_prep_edits" on public.meeting_preparation_edits;
create policy "internal_read_meeting_prep_edits" on public.meeting_preparation_edits
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_prep_edits" on public.meeting_preparation_edits;
create policy "internal_write_meeting_prep_edits" on public.meeting_preparation_edits
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 4) updated_at trigger + إعداد Task Type للـ AI Provider Layer
-- ============================================================
drop trigger if exists on_meeting_prep_touch on public.meeting_preparations;
create trigger on_meeting_prep_touch
  before update on public.meeting_preparations
  for each row execute procedure public.touch_updated_at();

insert into public.ai_task_model_config (task_type, provider, model)
values ('meeting_preparation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- انتهى 0029
-- ============================================================
