-- ============================================================
-- Phase 12.1 — Engineering QA Foundation
-- إضافات بحتة كليًا، لا تلمس أي جدول موجود. النظام ده منفصل تمامًا عن
-- Engineering Audit (migration 0035) — ده "Operating System" لعمليات
-- مراجعة هندسية متعددة المراحل عبر الزمن (Review History)، مش تدقيق
-- واحد حي زي باقي الجداول. المرحلة دي بنية تحتية بس — صفر منطق فحص
-- فعلي (Static/Security/Performance/... Audit) هيتضاف في مراحل قادمة
-- بدون أي تعديل على الجداول أو الـ Engine هنا.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) engineering_reviews — كل صف = جلسة مراجعة مستقلة كاملة (سجل
-- تاريخي حقيقي من الأول، مش "صف حي واحد" زي باقي محركات المشروع —
-- المشروع ممكن يبقى عنده عشرات المراجعات عبر الوقت، وده مطلوب صراحةً
-- في Review History). Partial Unique Index بيمنع أكتر من مراجعة نشطة
-- (queued/running) لنفس المشروع في نفس الوقت على مستوى الـ DB نفسه،
-- مش بس فحص في الكود.
-- ============================================================
create table if not exists public.engineering_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  review_number integer not null,
  review_version integer not null default 1,
  repository_url text not null default '',
  repository_branch text not null default 'main',
  repository_commit text,
  review_status text not null default 'pending'
    check (review_status in ('pending','queued','running','completed','failed','cancelled','needs_review','certified','rejected')),
  overall_progress numeric not null default 0,
  last_error text,
  acknowledged_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_engineering_reviews_project_number on public.engineering_reviews(project_id, review_number);
create index if not exists idx_engineering_reviews_project on public.engineering_reviews(project_id, created_at desc);

-- أهم قيد أمان في المرحلة دي بالكامل: مفيش أكتر من مراجعة "نشطة" واحدة
-- لنفس المشروع في نفس اللحظة — مفروض على مستوى الـ DB نفسه، مش الكود.
create unique index if not exists idx_engineering_reviews_one_active_per_project
  on public.engineering_reviews(project_id)
  where review_status in ('queued', 'running');

create or replace function public.touch_engineering_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_engineering_reviews_update_touch on public.engineering_reviews;
create trigger on_engineering_reviews_update_touch
  before update on public.engineering_reviews
  for each row execute procedure public.touch_engineering_reviews_updated_at();

-- ============================================================
-- 2) engineering_review_stages — مراحل كل مراجعة، بترتيب تنفيذ ثابت.
-- stage_key بيربط الصف بتعريفه في الـ Stage Registry (الكود)، وstage_name
-- Snapshot لاسم العرض وقت الإنشاء (عشان لو الـ Registry اتغيّر لاحقًا،
-- المراجعات القديمة تفضل عارضة الاسم اللي كان موجود وقتها).
-- ============================================================
create table if not exists public.engineering_review_stages (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.engineering_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_key text not null,
  stage_name text not null,
  execution_order integer not null,
  stage_status text not null default 'pending'
    check (stage_status in ('pending','running','completed','failed','cancelled')),
  stage_version integer not null default 1,
  retry_count integer not null default 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_engineering_review_stages_review_key on public.engineering_review_stages(review_id, stage_key);
create index if not exists idx_engineering_review_stages_project on public.engineering_review_stages(project_id);

create or replace function public.touch_engineering_review_stages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_engineering_review_stages_update_touch on public.engineering_review_stages;
create trigger on_engineering_review_stages_update_touch
  before update on public.engineering_review_stages
  for each row execute procedure public.touch_engineering_review_stages_updated_at();

-- ============================================================
-- 3) engineering_stage_results — نتيجة كل مرحلة (فاضية/Placeholder في
-- المرحلة دي لحد ما منطق الفحص الفعلي يتضاف في مرحلة قادمة).
-- ============================================================
create table if not exists public.engineering_stage_results (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.engineering_review_stages(id) on delete cascade,
  review_id uuid not null references public.engineering_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  score numeric,
  summary text not null default '',
  findings_json jsonb not null default '[]'::jsonb,
  recommendations_json jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists idx_engineering_stage_results_stage on public.engineering_stage_results(stage_id);
create index if not exists idx_engineering_stage_results_review on public.engineering_stage_results(review_id);

-- ============================================================
-- 4) engineering_certificates — بنية فقط (Structure Only) — إصدار
-- الشهادة الفعلي (منطق الحساب والتوقيع) هيتضاف في مرحلة قادمة.
-- ============================================================
create table if not exists public.engineering_certificates (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.engineering_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  certificate_number text unique,
  certification_status text not null default 'pending'
    check (certification_status in ('pending','issued','revoked')),
  overall_score numeric,
  certificate_version integer not null default 1,
  generated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_engineering_certificates_review on public.engineering_certificates(review_id);
create index if not exists idx_engineering_certificates_project on public.engineering_certificates(project_id);

-- ============================================================
-- 5) engineering_review_events — سجل الأحداث (Review Timeline) — جدول
-- مخصص جديد (النظام العام لـ Activity Log في المشروع بيجمع القراءة من
-- جداول الـ *_versions الموجودة أصلاً بدون جدول مركزي، لكن الأحداث
-- المطلوبة هنا — Stage Started/Retried/Cancelled إلخ — مفهوم جديد
-- كليًا مش موجود في أي جدول حالي، فمحتاج مصدر حقيقي يتسجّل فيه فعلاً).
-- ============================================================
create table if not exists public.engineering_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.engineering_reviews(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'review_created','review_started','stage_started','stage_finished',
      'stage_failed','stage_retried','stage_cancelled','review_completed',
      'review_cancelled','certificate_generated'
    )),
  stage_key text,
  detail text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_engineering_review_events_review on public.engineering_review_events(review_id, created_at desc);
create index if not exists idx_engineering_review_events_project on public.engineering_review_events(project_id, created_at desc);

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة (كل مستخدم داخلي مسجّل دخول)
-- ============================================================
alter table public.engineering_reviews enable row level security;
alter table public.engineering_review_stages enable row level security;
alter table public.engineering_stage_results enable row level security;
alter table public.engineering_certificates enable row level security;
alter table public.engineering_review_events enable row level security;

create policy "internal_read_engineering_reviews" on public.engineering_reviews
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_reviews" on public.engineering_reviews
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_engineering_review_stages" on public.engineering_review_stages
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_review_stages" on public.engineering_review_stages
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_engineering_stage_results" on public.engineering_stage_results
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_stage_results" on public.engineering_stage_results
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_engineering_certificates" on public.engineering_certificates
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_certificates" on public.engineering_certificates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_engineering_review_events" on public.engineering_review_events
  for select using (auth.uid() is not null);
create policy "internal_write_engineering_review_events" on public.engineering_review_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
