-- ============================================================
-- PM Operating System — 0025 Brain Review & Approval Workflow (Phase 4C)
--
-- يضيف على project_brain_documents:
--   - حالة "in_review" وسيطة بين draft و approved.
--   - section_reviews jsonb: قرار PM لكل قسم (approved/needs_review/rejected).
--   - missing_info_dispositions jsonb: قرار PM لكل عنصر missing info.
--   - assumption_dispositions jsonb: قرار PM لكل assumption.
--   - readiness_score int: درجة جاهزية المشروع (0-100).
-- وينشئ جدول brain_settings صف واحد للـ confidence_threshold.
-- إضافي بحت، آمن للتشغيل المتكرر (idempotent).
-- ============================================================

-- ============================================================
-- 1) توسعة project_brain_documents — إضافة أعمدة review
-- ============================================================
alter table public.project_brain_documents
  add column if not exists section_reviews jsonb not null default '{}'::jsonb,
  add column if not exists missing_info_dispositions jsonb not null default '{}'::jsonb,
  add column if not exists assumption_dispositions jsonb not null default '{}'::jsonb,
  add column if not exists readiness_score int not null default 0
    check (readiness_score >= 0 and readiness_score <= 100),
  add column if not exists review_started_at timestamptz,
  add column if not exists review_started_by uuid references public.profiles(id) on delete set null,
  add column if not exists changes_requested_at timestamptz,
  add column if not exists changes_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists changes_requested_reason text;

-- توسعة enum الحالة عن طريق إعادة إنشاء الـ CHECK constraint
alter table public.project_brain_documents
  drop constraint if exists project_brain_documents_status_check;
alter table public.project_brain_documents
  add constraint project_brain_documents_status_check
  check (status in ('draft', 'in_review', 'approved', 'archived', 'rejected'));

-- ============================================================
-- 2) brain_settings — صف واحد (scope='global') لضبط الـ threshold
-- ============================================================
create table if not exists public.brain_settings (
  scope text primary key default 'global',
  /** أي قسم confidence أقل من ده يظهر بادج تحذير في الـ UI */
  confidence_threshold_percent int not null default 70
    check (confidence_threshold_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.brain_settings (scope) values ('global')
on conflict (scope) do nothing;

-- ============================================================
-- 3) RLS للجدول الجديد
-- ============================================================
alter table public.brain_settings enable row level security;

drop policy if exists "internal_read_brain_settings" on public.brain_settings;
create policy "internal_read_brain_settings" on public.brain_settings
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_brain_settings" on public.brain_settings;
create policy "internal_write_brain_settings" on public.brain_settings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 4) touch_updated_at trigger على brain_settings
-- ============================================================
drop trigger if exists on_brain_settings_touch on public.brain_settings;
create trigger on_brain_settings_touch
  before update on public.brain_settings
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- انتهى 0025 Brain Review & Approval Workflow
-- ============================================================
