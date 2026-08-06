-- ============================================================
-- PM Operating System — 0050 Meeting Intelligence System (Phase 2)
--
-- إضافي بحت، idempotent. مفيش أي DROP أو تعديل هدّام على meetings/
-- meeting_preparations/meeting_presentations/meeting_reviews الموجودين
-- أصلًا — بس أعمدة إضافية عليهم، وجداول جديدة للعناصر المُستخرجة
-- (قرارات/متطلبات/مخاطر/أسئلة/مهام) كصفوف حقيقية بدل jsonb blobs،
-- زائد نظام مرفقات عام وبحث نصي كامل (FTS) — مفيش أي منهم موجود قبل كده.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) تجهيز الاجتماع — حقول ناقصة + جداول ربط جديدة
-- ============================================================
alter table public.meeting_preparations
  add column if not exists title text,
  add column if not exists expected_outcomes text[] not null default '{}',
  add column if not exists previous_meeting_id uuid references public.meetings(id) on delete set null,
  add column if not exists linked_open_question_ids uuid[] not null default '{}',
  add column if not exists linked_risk_ids uuid[] not null default '{}',
  add column if not exists linked_pending_decision_ids uuid[] not null default '{}';

create table if not exists public.meeting_prep_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_preparation_id uuid not null references public.meeting_preparations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  full_name text not null,
  role text not null default '',
  is_client boolean not null default false,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_prep_participants_prep on public.meeting_prep_participants(meeting_preparation_id);

create table if not exists public.meeting_required_items (
  id uuid primary key default gen_random_uuid(),
  meeting_preparation_id uuid not null references public.meeting_preparations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_type text not null check (item_type in ('file', 'image', 'document', 'spreadsheet')),
  title text not null,
  description text not null default '',
  is_provided boolean not null default false,
  provided_attachment_id uuid, -- FK لـ meeting_attachments مضافة تحت بعد إنشائها
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_required_items_prep on public.meeting_required_items(meeting_preparation_id);

-- ============================================================
-- 2) meeting_attachments — نظام مرفقات عام (بديل recording_url الوحيد
-- الموجود حاليًا)، بنفس فلسفة lib/storage/discovery-uploads.ts.
-- ============================================================
create table if not exists public.meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade,
  meeting_preparation_id uuid references public.meeting_preparations(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  file_type text not null check (file_type in ('image', 'pdf', 'docx', 'xlsx', 'csv', 'other')),
  storage_path text not null,
  file_size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  ai_status text not null default 'pending' check (ai_status in ('pending', 'analyzing', 'ready', 'failed', 'unsupported')),
  ai_summary text,
  ai_confidence int check (ai_confidence >= 0 and ai_confidence <= 100),
  extracted_entities jsonb not null default '{}'::jsonb,
  related_decision_ids uuid[] not null default '{}',
  related_requirement_ids uuid[] not null default '{}',
  related_risk_ids uuid[] not null default '{}',
  last_error text,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_meeting_attachments_meeting on public.meeting_attachments(meeting_id);
create index if not exists idx_meeting_attachments_project on public.meeting_attachments(project_id);
create index if not exists idx_meeting_attachments_search on public.meeting_attachments using gin(search_vector);

alter table public.meeting_required_items
  add constraint meeting_required_items_attachment_fk
    foreign key (provided_attachment_id) references public.meeting_attachments(id) on delete set null;

-- ============================================================
-- 3) العناصر المُستخرجة كصفوف حقيقية (بدل jsonb string[] القديمة في
-- meeting_reviews) — كل عنصر بمعياره الخاص من الثقة والدليل.
-- meeting_reviews القديم فاضل زي ما هو، مفيش أي تعديل عليه.
-- ============================================================
create table if not exists public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quote text,
  speaker_guess text,
  status text not null default 'active' check (status in ('active', 'superseded')),
  -- تتبّع التغيير: لو قرار جديد يلغي قرار قديم، القديم بيتحوّل superseded
  -- بدل ما يتمسح — مفيش استبدال صامت أبدًا.
  superseded_by_id uuid references public.meeting_decisions(id) on delete set null,
  previous_value text,
  change_reason text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_decisions_meeting on public.meeting_decisions(meeting_id);
create index if not exists idx_meeting_decisions_project on public.meeting_decisions(project_id, status);
create index if not exists idx_meeting_decisions_search on public.meeting_decisions using gin(search_vector);

create table if not exists public.meeting_requirements (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  requirement_type text not null default 'functional' check (requirement_type in ('functional', 'non_functional')),
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quote text,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_requirements_meeting on public.meeting_requirements(meeting_id);
create index if not exists idx_meeting_requirements_search on public.meeting_requirements using gin(search_vector);

create table if not exists public.meeting_risks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  severity text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low')),
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quote text,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_risks_meeting on public.meeting_risks(meeting_id);
create index if not exists idx_meeting_risks_search on public.meeting_risks using gin(search_vector);

create table if not exists public.meeting_questions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  status text not null default 'open' check (status in ('open', 'answered')),
  answer text,
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quote text,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_questions_meeting on public.meeting_questions(meeting_id);
create index if not exists idx_meeting_questions_search on public.meeting_questions using gin(search_vector);

create table if not exists public.meeting_tasks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  owner text,
  due_hint text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quote text,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_tasks_meeting on public.meeting_tasks(meeting_id);
create index if not exists idx_meeting_tasks_search on public.meeting_tasks using gin(search_vector);

-- محاور أقل حجمًا: جدول عام واحد بمُصنِّف (category) بدل 7 جداول شبه
-- متطابقة (business rules, pain points, constraints, ideas,
-- dependencies, conflicts, missing information).
create table if not exists public.meeting_extracted_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in (
    'business_rule', 'pain_point', 'constraint', 'idea', 'dependency', 'conflict', 'missing_information'
  )),
  text text not null,
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quote text,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_extracted_items_meeting on public.meeting_extracted_items(meeting_id, category);
create index if not exists idx_meeting_extracted_items_search on public.meeting_extracted_items using gin(search_vector);

-- سجل تدقيق: صف واحد لكل تشغيلة تحليل، بالمخرج الخام الكامل زي ما
-- رجعه الـ AI — عشان أي تحسين لاحق في الـ Prompt يقدر يرجع يقارن.
create table if not exists public.meeting_ai_results (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  pipeline_version text not null default 'v2',
  raw_ai_output jsonb not null default '{}'::jsonb,
  confidence_overall int check (confidence_overall >= 0 and confidence_overall <= 100),
  generated_at timestamptz not null default now()
);
create index if not exists idx_meeting_ai_results_meeting on public.meeting_ai_results(meeting_id);

-- ============================================================
-- 4) دالة بحث موحّدة عبر كل جداول المعرفة المُستخرجة من الاجتماعات.
-- ============================================================
create or replace function public.search_meeting_knowledge(p_project_id uuid, p_query text)
returns table (
  source_table text,
  id uuid,
  meeting_id uuid,
  text text,
  rank real
)
language sql
stable
as $$
  select
    'meeting_decisions' as source_table, d.id, d.meeting_id, d.text,
    ts_rank(d.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_decisions d
  where d.project_id = p_project_id and d.search_vector @@ plainto_tsquery('arabic', p_query)
  union all
  select
    'meeting_requirements' as source_table, r.id, r.meeting_id, r.text,
    ts_rank(r.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_requirements r
  where r.project_id = p_project_id and r.search_vector @@ plainto_tsquery('arabic', p_query)
  union all
  select
    'meeting_risks' as source_table, rk.id, rk.meeting_id, rk.text,
    ts_rank(rk.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_risks rk
  where rk.project_id = p_project_id and rk.search_vector @@ plainto_tsquery('arabic', p_query)
  union all
  select
    'meeting_questions' as source_table, q.id, q.meeting_id, q.text,
    ts_rank(q.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_questions q
  where q.project_id = p_project_id and q.search_vector @@ plainto_tsquery('arabic', p_query)
  union all
  select
    'meeting_tasks' as source_table, t.id, t.meeting_id, t.text,
    ts_rank(t.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_tasks t
  where t.project_id = p_project_id and t.search_vector @@ plainto_tsquery('arabic', p_query)
  union all
  select
    'meeting_extracted_items' as source_table, e.id, e.meeting_id, e.text,
    ts_rank(e.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_extracted_items e
  where e.project_id = p_project_id and e.search_vector @@ plainto_tsquery('arabic', p_query)
  union all
  select
    'meeting_attachments' as source_table, a.id, a.meeting_id,
    coalesce(a.title || ' — ' || a.ai_summary, a.title) as text,
    ts_rank(a.search_vector, plainto_tsquery('arabic', p_query)) as rank
  from public.meeting_attachments a
  where a.project_id = p_project_id and a.search_vector @@ plainto_tsquery('arabic', p_query)
  order by rank desc
  limit 100;
$$;

-- ============================================================
-- 5) Triggers: تحديث search_vector تلقائيًا + updated_at (touch_updated_at
-- دالة عامة موجودة أصلًا من migration 0020/0021).
-- ============================================================
create or replace function public.meeting_decisions_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.text, '') || ' ' || coalesce(new.evidence_quote, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_decisions_search on public.meeting_decisions;
create trigger on_meeting_decisions_search before insert or update on public.meeting_decisions
  for each row execute procedure public.meeting_decisions_search_trigger();

create or replace function public.meeting_requirements_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.text, '') || ' ' || coalesce(new.evidence_quote, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_requirements_search on public.meeting_requirements;
create trigger on_meeting_requirements_search before insert or update on public.meeting_requirements
  for each row execute procedure public.meeting_requirements_search_trigger();

create or replace function public.meeting_risks_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.text, '') || ' ' || coalesce(new.evidence_quote, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_risks_search on public.meeting_risks;
create trigger on_meeting_risks_search before insert or update on public.meeting_risks
  for each row execute procedure public.meeting_risks_search_trigger();

create or replace function public.meeting_questions_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.text, '') || ' ' || coalesce(new.evidence_quote, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_questions_search on public.meeting_questions;
create trigger on_meeting_questions_search before insert or update on public.meeting_questions
  for each row execute procedure public.meeting_questions_search_trigger();

create or replace function public.meeting_tasks_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.text, '') || ' ' || coalesce(new.evidence_quote, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_tasks_search on public.meeting_tasks;
create trigger on_meeting_tasks_search before insert or update on public.meeting_tasks
  for each row execute procedure public.meeting_tasks_search_trigger();

create or replace function public.meeting_extracted_items_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.text, '') || ' ' || coalesce(new.evidence_quote, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_extracted_items_search on public.meeting_extracted_items;
create trigger on_meeting_extracted_items_search before insert or update on public.meeting_extracted_items
  for each row execute procedure public.meeting_extracted_items_search_trigger();

create or replace function public.meeting_attachments_search_trigger() returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('arabic', coalesce(new.title, '') || ' ' || coalesce(new.description, '') || ' ' || coalesce(new.ai_summary, ''));
  return new;
end;
$$;
drop trigger if exists on_meeting_attachments_search on public.meeting_attachments;
create trigger on_meeting_attachments_search before insert or update on public.meeting_attachments
  for each row execute procedure public.meeting_attachments_search_trigger();

drop trigger if exists on_meeting_attachments_touch on public.meeting_attachments;
create trigger on_meeting_attachments_touch before update on public.meeting_attachments
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 6) Bucket تخزين للمرفقات (خاص، وصول عبر Signed URL بس — نفس فلسفة
-- support-attachments/discovery-uploads).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('meeting-attachments', 'meeting-attachments', false)
on conflict (id) do nothing;

do $$ begin
  create policy "service_role_all_meeting_attachments" on storage.objects
    for all
    using (bucket_id = 'meeting-attachments' and auth.role() = 'service_role')
    with check (bucket_id = 'meeting-attachments' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_read_meeting_attachments_storage" on storage.objects
    for select
    using (bucket_id = 'meeting-attachments' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ============================================================
-- 7) RLS — نفس سياسة النظام لكل الجداول الجديدة.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'meeting_prep_participants', 'meeting_required_items', 'meeting_attachments',
    'meeting_decisions', 'meeting_requirements', 'meeting_risks', 'meeting_questions',
    'meeting_tasks', 'meeting_extracted_items', 'meeting_ai_results'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "internal_read_%s" on public.%I', t, t);
    execute format('create policy "internal_read_%s" on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists "internal_write_%s" on public.%I', t, t);
    execute format('create policy "internal_write_%s" on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
  end loop;
end $$;

-- ============================================================
-- 8) توسعة meeting_live_captures.capture_type — 4 فئات جديدة (قاعدة
-- عمل/نقطة ألم/قيد/اعتماد) بنفس تصنيف الاستخراج الغني الجديد، عشان
-- الالتقاط اليدوي أثناء الاجتماع (Live Meeting Mode) يغطّي نفس الفئات.
-- ============================================================
alter table public.meeting_live_captures drop constraint if exists meeting_live_captures_capture_type_check;
alter table public.meeting_live_captures add constraint meeting_live_captures_capture_type_check
  check (capture_type in (
    'decision', 'risk', 'requirement', 'idea', 'question', 'action_item', 'client_feedback',
    'business_rule', 'pain_point', 'constraint', 'dependency'
  ));

-- ============================================================
-- 9) نوع مهمة AI جديد لتحليل المرفقات بالذكاء الاصطناعي.
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('meeting_file_analysis', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

insert into public.ai_task_model_config (task_type, provider, model)
values ('meeting_extraction_v2', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- انتهى 0050
-- ============================================================
