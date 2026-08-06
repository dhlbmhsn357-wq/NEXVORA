-- ============================================================
-- PM Operating System — 0024 Project Brain v2 (Phase 4B)
--
-- قاعدة معرفة مركزية للمشروع بـ19 قسمًا. Draft → Approved workflow،
-- versioning كامل، ولا يمس project_brain القديم (Phase 1) بحرف.
-- إضافي بحت، idempotent.
-- ============================================================

-- ============================================================
-- 1) project_brain_documents — سطر لكل نسخة (draft/approved/archived)
-- ============================================================
create table if not exists public.project_brain_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'archived', 'rejected')),

  /** المحتوى الكامل للـ 19 قسمًا كما هو موصوف في lib/brain-v2/types.ts */
  content jsonb not null,

  completeness_score int not null default 0
    check (completeness_score >= 0 and completeness_score <= 100),

  /** من أي تحليل بُني الـ Draft (nullable إذا كان draft يدوي) */
  based_on_analysis_id uuid references public.discovery_analyses(id) on delete set null,
  /** الإصدار السابق للمرجعية في الـ Diff */
  previous_version int,
  change_summary text,

  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, version)
);

create index if not exists idx_pbd_project_status
  on public.project_brain_documents(project_id, status);
create index if not exists idx_pbd_project_version
  on public.project_brain_documents(project_id, version desc);

-- ============================================================
-- 2) project_brain_edits — سجل كامل لتعديلات الأقسام
--    قبل/بعد + المستخدم + الوقت + سبب التعديل. لتتبّع manual edits.
-- ============================================================
create table if not exists public.project_brain_edits (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  section_key text not null,
  before_value jsonb,
  after_value jsonb not null,
  reason text,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz not null default now()
);

create index if not exists idx_pbe_document
  on public.project_brain_edits(document_id, edited_at desc);
create index if not exists idx_pbe_project
  on public.project_brain_edits(project_id, edited_at desc);

-- ============================================================
-- 3) RLS — نفس سياسة النظام (أي مستخدم داخلي مسجّل دخول)
-- ============================================================
alter table public.project_brain_documents enable row level security;
alter table public.project_brain_edits enable row level security;

drop policy if exists "internal_read_pbd" on public.project_brain_documents;
create policy "internal_read_pbd" on public.project_brain_documents
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_pbd" on public.project_brain_documents;
create policy "internal_write_pbd" on public.project_brain_documents
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_pbe" on public.project_brain_edits;
create policy "internal_read_pbe" on public.project_brain_edits
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_pbe" on public.project_brain_edits;
create policy "internal_write_pbe" on public.project_brain_edits
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 4) updated_at trigger
-- ============================================================
drop trigger if exists on_pbd_touch on public.project_brain_documents;
create trigger on_pbd_touch
  before update on public.project_brain_documents
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- انتهى 0024 Project Brain v2
-- ============================================================
