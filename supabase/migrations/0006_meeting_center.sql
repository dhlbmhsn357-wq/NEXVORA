-- ============================================================
-- Phase 4 — Meeting Center: Database
-- إضافات بحتة على الـ Schema الحالي، بدون أي تعديل على سلوك موجود.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) project_code — كود قصير وفريد وثابت لكل مشروع، يُستخدم فقط لربط
--    رسائل Telegram بالمشروع الصحيح.
-- ============================================================
alter table public.projects
  add column if not exists project_code text unique;

create or replace function public.generate_project_code()
returns text
language plpgsql
as $$
declare
  -- استبعاد الحروف/الأرقام المتشابهة بصريًا (0/O، 1/I) لتقليل أخطاء النسخ اليدوي
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'PRJ-' || (
      select string_agg(substr(chars, (ceil(random() * length(chars)))::int, 1), '')
      from generate_series(1, 4)
    );
    exit when not exists (select 1 from public.projects where project_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_project_code()
returns trigger
language plpgsql
as $$
begin
  if new.project_code is null then
    new.project_code := public.generate_project_code();
  end if;
  return new;
end;
$$;

drop trigger if exists on_project_insert_set_code on public.projects;
create trigger on_project_insert_set_code
  before insert on public.projects
  for each row execute procedure public.set_project_code();

-- توليد كود للمشاريع الموجودة بالفعل (لو فيه)
update public.projects set project_code = public.generate_project_code()
where project_code is null;

alter table public.projects
  alter column project_code set not null;

-- ============================================================
-- 2) meetings
-- ============================================================
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  title text,
  meeting_date timestamptz not null default now(),
  recording_url text,
  status text not null default 'pending'
    check (status in ('pending','transcribing','transcribed','extracting','processed','failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_meetings_project on public.meetings(project_id);
create index if not exists idx_meetings_status on public.meetings(status);

-- ============================================================
-- 3) transcripts — النص الخام فقط، بدون أي تعديل عليه
-- ============================================================
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  raw_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transcripts_meeting on public.transcripts(meeting_id);

-- ============================================================
-- 4) ربط Project Brain Entry بالاجتماع اللي جاءت منه (لمعرفة المصدر)
-- ============================================================
alter table public.project_brain_entries
  add column if not exists source_meeting_id uuid references public.meetings(id) on delete set null;

create index if not exists idx_brain_source_meeting on public.project_brain_entries(source_meeting_id);

-- ============================================================
-- 5) Task Types الجديدة (تفريغ صوتي + استخراج من الاجتماع)
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('transcription', 'gemini', 'gemini-2.5-flash'),
  ('meeting_extraction', 'gemini', 'gemini-2.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- 6) Storage Bucket خاص (private) للتسجيلات الصوتية
-- ============================================================
insert into storage.buckets (id, name, public)
values ('meetings', 'meetings', false)
on conflict (id) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة
-- ============================================================
alter table public.meetings enable row level security;
alter table public.transcripts enable row level security;

create policy "internal_read_meetings" on public.meetings
  for select using (auth.uid() is not null);
create policy "internal_write_meetings" on public.meetings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_transcripts" on public.transcripts
  for select using (auth.uid() is not null);
create policy "internal_write_transcripts" on public.transcripts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
