-- ============================================================
-- Meeting Presentation + Knowledge Aggregation Layer source (Phase 3
-- Part 2) — تبويب جديد بين Meeting Preparation و Meetings، بيدير فيه
-- الـ PM عرض تقديمي احترافي (توليد AI + تعديل يدوي)، يبدأ منه
-- Live Meeting Mode (Timer/Agenda/Capture)، وبعد الاجتماع بيتولّد
-- Meeting Review (مقارنة الخطة بالـ Transcript) اللي بيتغذّى تلقائيًا
-- على Project Brain عبر نفس طبقة الـ Pending Changes الموجودة (مصدر
-- معرفة جديد source_type='meeting_review'، صفر منطق مكرر).
-- ============================================================

-- المصدر الجديد للـ Knowledge Aggregation Layer — نفس الجدولين
-- الموجودين من قبل (0044)، إضافة قيمة واحدة فقط للـ check constraint.
alter table public.brain_change_batches
  drop constraint if exists brain_change_batches_source_type_check;
alter table public.brain_change_batches
  add constraint brain_change_batches_source_type_check
  check (source_type in ('meeting_transcript','meeting_ai_analysis','manual_note','prototype_review','support_feedback','meeting_review'));

alter table public.brain_pending_changes
  drop constraint if exists brain_pending_changes_source_type_check;
alter table public.brain_pending_changes
  add constraint brain_pending_changes_source_type_check
  check (source_type in ('meeting_transcript','meeting_ai_analysis','manual_note','prototype_review','support_feedback','meeting_review'));

-- ============================================================
-- 1) meeting_presentations — عرض تقديمي واحد (Draft قابل لإعادة التوليد)
--    بيتربط باجتماع حقيقي (meetings.id) بس وقت الضغط على "ابدأ الاجتماع"،
--    قبل كده بيفضل مستقل (مفيش اجتماع لسه اتعمل له Row).
-- ============================================================
create table if not exists public.meeting_presentations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,
  title text not null default '',
  meeting_date timestamptz,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','failed')),
  version integer not null default 1,
  slides jsonb not null default '{}'::jsonb,
  overall_confidence integer,
  last_error text,
  generation_claimed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meeting_presentations_project on public.meeting_presentations(project_id, created_at desc);
create index if not exists idx_meeting_presentations_meeting on public.meeting_presentations(meeting_id);

create table if not exists public.meeting_presentation_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  presentation_id uuid not null references public.meeting_presentations(id) on delete cascade,
  version integer not null,
  reason text not null default '',
  slide_regenerated text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_presentation_versions_presentation on public.meeting_presentation_versions(presentation_id, version desc);

-- ============================================================
-- 2) Live Meeting Mode — جلسة حية واحدة لكل اجتماع فعلي + التقاطات فورية
-- ============================================================
create table if not exists public.meeting_live_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  presentation_id uuid not null references public.meeting_presentations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  current_slide_index integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_meeting_live_sessions_meeting on public.meeting_live_sessions(meeting_id);
create unique index if not exists idx_meeting_live_sessions_active_meeting
  on public.meeting_live_sessions(meeting_id) where status = 'active';

create table if not exists public.meeting_live_captures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null references public.meeting_live_sessions(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  capture_type text not null
    check (capture_type in ('decision','risk','requirement','idea','question','action_item','client_feedback')),
  text text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_live_captures_session on public.meeting_live_captures(session_id, created_at);

-- ============================================================
-- 3) meeting_reviews — مقارنة الخطة (Agenda/Questions من العرض) بالـ
--    Transcript المستخرج بعد التحليل. مصدر جديد يتغذّى منه Project Brain.
-- ============================================================
create table if not exists public.meeting_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  meeting_id uuid not null unique references public.meetings(id) on delete cascade,
  presentation_id uuid references public.meeting_presentations(id) on delete set null,
  status text not null default 'generating' check (status in ('generating','ready','failed')),
  plan_snapshot jsonb not null default '{}'::jsonb,
  discussed jsonb not null default '[]'::jsonb,
  not_discussed jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  new_decisions jsonb not null default '[]'::jsonb,
  new_tasks jsonb not null default '[]'::jsonb,
  new_risks jsonb not null default '[]'::jsonb,
  new_assumptions jsonb not null default '[]'::jsonb,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_reviews_project on public.meeting_reviews(project_id, created_at desc);

-- ============================================================
-- 4) meeting_lifecycle_events — الـ 7 مراحل اللي بيتغذّى منها الـ
--    Visual Timeline (Planned→Started→Finished→Transcript Uploaded→
--    AI Analysis Completed→Project Brain Updated→Presentation Updated)
-- ============================================================
create table if not exists public.meeting_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  event_type text not null
    check (event_type in ('planned','started','finished','transcript_uploaded','analysis_completed','brain_updated','presentation_updated')),
  detail text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_lifecycle_events_meeting on public.meeting_lifecycle_events(meeting_id, created_at);

-- ============================================================
-- Row Level Security — نفس نمط كل الجداول السابقة (صلاحيات المشروع
-- الفعلية بتتفرض على مستوى الـ App عبر requireRole/RBAC، مش RLS).
-- ============================================================
alter table public.meeting_presentations enable row level security;
alter table public.meeting_presentation_versions enable row level security;
alter table public.meeting_live_sessions enable row level security;
alter table public.meeting_live_captures enable row level security;
alter table public.meeting_reviews enable row level security;
alter table public.meeting_lifecycle_events enable row level security;

drop policy if exists "internal_read_meeting_presentations" on public.meeting_presentations;
create policy "internal_read_meeting_presentations" on public.meeting_presentations for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_presentations" on public.meeting_presentations;
create policy "internal_write_meeting_presentations" on public.meeting_presentations for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_meeting_presentation_versions" on public.meeting_presentation_versions;
create policy "internal_read_meeting_presentation_versions" on public.meeting_presentation_versions for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_presentation_versions" on public.meeting_presentation_versions;
create policy "internal_write_meeting_presentation_versions" on public.meeting_presentation_versions for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_meeting_live_sessions" on public.meeting_live_sessions;
create policy "internal_read_meeting_live_sessions" on public.meeting_live_sessions for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_live_sessions" on public.meeting_live_sessions;
create policy "internal_write_meeting_live_sessions" on public.meeting_live_sessions for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_meeting_live_captures" on public.meeting_live_captures;
create policy "internal_read_meeting_live_captures" on public.meeting_live_captures for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_live_captures" on public.meeting_live_captures;
create policy "internal_write_meeting_live_captures" on public.meeting_live_captures for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_meeting_reviews" on public.meeting_reviews;
create policy "internal_read_meeting_reviews" on public.meeting_reviews for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_reviews" on public.meeting_reviews;
create policy "internal_write_meeting_reviews" on public.meeting_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_meeting_lifecycle_events" on public.meeting_lifecycle_events;
create policy "internal_read_meeting_lifecycle_events" on public.meeting_lifecycle_events for select using (auth.uid() is not null);
drop policy if exists "internal_write_meeting_lifecycle_events" on public.meeting_lifecycle_events;
create policy "internal_write_meeting_lifecycle_events" on public.meeting_lifecycle_events for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Realtime — عشان Live Meeting Mode يشتغل بالتحديث الفوري بين أي تابات
-- مفتوحة على نفس الاجتماع (نفس فلسفة notifications/brain_pending_changes).
-- "alter publication add table" مش Idempotent (بيرمي لو الجدول مضاف
-- بالفعل)، فبنتحقق من pg_publication_tables الأول عشان السكريبت يفضل
-- قابل لإعادة التشغيل الآمن زي باقي الأسطر.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meeting_live_sessions'
  ) then
    alter publication supabase_realtime add table public.meeting_live_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meeting_live_captures'
  ) then
    alter publication supabase_realtime add table public.meeting_live_captures;
  end if;
end $$;

-- ============================================================
-- إعداد نموذج AI الافتراضي لمهمّتين جديدتين (نفس نمط كل مرحلة سابقة)
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('meeting_presentation_generation', 'gemini', 'gemini-3.5-flash'),
  ('meeting_review_synthesis', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;
