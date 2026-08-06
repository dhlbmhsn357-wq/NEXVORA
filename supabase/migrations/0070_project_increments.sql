-- 0070 — سجل الزيادات (Project Increments)
--
-- الهدف: بعد ما المشروع يعدّي الاجتماع الأول + الفورم + التحليل + الـ PRD
-- + البرومتات + Engineering QA، أي معلومة جديدة (اجتماع تاني، جلسة اكتشاف،
-- قرار، ملف) تتسجّل كـ "زيادة" مستقلة بدل ما تسبّب إعادة بناء كل المراحل.
--
-- كل صف بيمسك:
--  - إيه اللي اتضاف بالظبط (`delta` = العناصر الجديدة لكل قسم في الـ Brain)
--  - مصدر الزيادة (اجتماع / جلسة / قرار / ملف / يدوي)
--  - وصلت لفين في السلسلة (`status`)
--
-- الهجرة إضافية بالكامل: مفيش drop ولا alter لأي جدول قائم.

create table if not exists public.project_increments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sequence_number integer not null,
  title text not null default '',
  source_type text not null default 'manual'
    check (source_type in ('discovery_session','meeting','decision','file','recommendation','manual')),
  source_ref_id uuid,
  summary text not null default '',
  -- العناصر المضافة لكل قسم في الـ Brain: { "business_goals": [ ... ], ... }
  delta jsonb not null default '{}'::jsonb,
  added_count integer not null default 0,
  brain_document_id uuid references public.project_brain_documents(id) on delete set null,
  brain_version integer,
  status text not null default 'open'
    check (status in ('open','prd_drafted','prompted','qa_done','closed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_project_increments_seq
  on public.project_increments (project_id, sequence_number);
create index if not exists idx_project_increments_project
  on public.project_increments (project_id, created_at desc);

create or replace function public.touch_project_increments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_increments_updated_at on public.project_increments;
create trigger trg_project_increments_updated_at
  before update on public.project_increments
  for each row execute function public.touch_project_increments_updated_at();

alter table public.project_increments enable row level security;

drop policy if exists project_increments_auth_read on public.project_increments;
create policy project_increments_auth_read on public.project_increments
  for select to authenticated using (true);

drop policy if exists project_increments_service_all on public.project_increments;
create policy project_increments_service_all on public.project_increments
  for all to service_role using (true) with check (true);


-- أقسام الـ PRD المخصّصة للزيادات: كل زيادة بتاخد قسم جديد خاص بيها بدل
-- ما الـ PRD كله يتعاد توليده من الصفر.
create table if not exists public.prd_increment_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  increment_id uuid not null references public.project_increments(id) on delete cascade,
  title text not null default '',
  content jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed')),
  last_error text,
  generated_from_brain_version integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prd_increment_sections_increment
  on public.prd_increment_sections (increment_id);
create index if not exists idx_prd_increment_sections_project
  on public.prd_increment_sections (project_id, order_index);

drop trigger if exists trg_prd_increment_sections_updated_at on public.prd_increment_sections;
create trigger trg_prd_increment_sections_updated_at
  before update on public.prd_increment_sections
  for each row execute function public.touch_project_increments_updated_at();

alter table public.prd_increment_sections enable row level security;

drop policy if exists prd_increment_sections_auth_read on public.prd_increment_sections;
create policy prd_increment_sections_auth_read on public.prd_increment_sections
  for select to authenticated using (true);

drop policy if exists prd_increment_sections_service_all on public.prd_increment_sections;
create policy prd_increment_sections_service_all on public.prd_increment_sections
  for all to service_role using (true) with check (true);


-- ربط المرحلة الجديدة في خط البرومتات بالزيادة اللي سبّبتها، عشان نقدر
-- نولّد برومت للمرحلة الجديدة بس ونعرف مصدرها.
alter table public.prototype_prompt_stages
  add column if not exists increment_id uuid references public.project_increments(id) on delete set null;

create index if not exists idx_prototype_prompt_stages_increment
  on public.prototype_prompt_stages (increment_id);
