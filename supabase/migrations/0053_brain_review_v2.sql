-- ============================================================
-- PM Operating System — 0053 Brain Review & Executive Approval Engine
-- (Phase 5 — Executive Design Review Board)
--
-- إضافي بحت، idempotent. مفيش أي عمود اتشال أو صف اتحذف من
-- project_brain_documents أو أي جدول قديم. section_reviews/
-- missing_info_dispositions/assumption_dispositions فاضلين زي ما هما —
-- الجداول الجديدة دي طبقة موازية (per-object review) بتتكامل معاهم مش
-- بتستبدلهم. الفئات/الحالات نص + CHECK زي كل جدول تصنيفي تاني في
-- المشروع، عمدًا مش Lookup Table منفصل. "Blocking Issues" و"Dependency
-- Checks" اللي طلبهم الـ spec كجداول منفصلة اتدمجوا داخل
-- brain_review_validation_reports.issues (jsonb) عشان نتجنّب تكرار
-- البيانات — نفس القرار المتكرر في كل مرحلة سابقة. "Approval History"
-- و"Reviewer Actions" اتدمجوا في جدول واحد brain_review_events.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) brain_review_objects — مراجعة فردية لكل عنصر معرفة (17 قسم Array
-- في Brain v2)، مش القسم كامل بس. حالات الـ spec السبعة بالظبط +
-- needs_revalidation كـ flag مستقل (مش حالة تامنة).
-- ============================================================
create table if not exists public.brain_review_objects (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  section_key text not null,
  item_key text not null,
  item_title text not null default '',
  state text not null default 'pending_review'
    check (state in ('pending_review', 'approved', 'approved_with_modification', 'needs_revision', 'rejected', 'deferred', 'blocked')),
  reason text,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  version int not null default 1,
  needs_revalidation boolean not null default false,
  revalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_brain_review_objects_unique
  on public.brain_review_objects(document_id, section_key, item_key);
create index if not exists idx_brain_review_objects_document on public.brain_review_objects(document_id);
create index if not exists idx_brain_review_objects_state on public.brain_review_objects(document_id, state);

drop trigger if exists on_brain_review_objects_touch on public.brain_review_objects;
create trigger on_brain_review_objects_touch before update on public.brain_review_objects
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 2) brain_review_object_versions — سجل كامل بلا استبدال صامت، نفس نمط
-- recommendation_versions (Phase 4) بالظبط.
-- ============================================================
create table if not exists public.brain_review_object_versions (
  id uuid primary key default gen_random_uuid(),
  review_object_id uuid not null references public.brain_review_objects(id) on delete cascade,
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  state text not null,
  reason text,
  snapshot jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_brain_review_object_versions_obj on public.brain_review_object_versions(review_object_id, version desc);

-- ============================================================
-- 3) brain_review_object_dependencies — روابط بين عناصر المراجعة، متاحة
-- قبل الاعتماد (على عكس knowledge_relations اللي بتتبنى بعد الاعتماد
-- بس) — نفس شكل recommendation_dependencies/knowledge_relations.
-- ============================================================
create table if not exists public.brain_review_object_dependencies (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_object_id uuid not null references public.brain_review_objects(id) on delete cascade,
  depends_on_review_object_id uuid not null references public.brain_review_objects(id) on delete cascade,
  relation_type text not null default 'depends_on'
    check (relation_type in ('depends_on', 'conflicts_with', 'related_to')),
  source text not null default 'ai_inferred' check (source in ('ai_inferred', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists idx_brain_review_object_dependencies_document on public.brain_review_object_dependencies(document_id);
create unique index if not exists idx_brain_review_object_dependencies_unique
  on public.brain_review_object_dependencies(review_object_id, depends_on_review_object_id, relation_type);

-- ============================================================
-- 4) brain_review_validation_reports — نتيجة كل تشغيلة تحقق (حتمي + AI)
-- — يشمل Completeness Scores + Issues (بما فيها Duplicate/Circular/
-- Dependency كأنواع issue، مش جداول منفصلة).
-- ============================================================
create table if not exists public.brain_review_validation_reports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  issues jsonb not null default '[]'::jsonb,
  business_readiness int check (business_readiness between 0 and 100),
  architecture_readiness int check (architecture_readiness between 0 and 100),
  technical_readiness int check (technical_readiness between 0 and 100),
  ai_confidence int check (ai_confidence between 0 and 100),
  last_error text,
  requested_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);
create index if not exists idx_brain_review_validation_reports_document
  on public.brain_review_validation_reports(document_id, generated_at desc);

-- ============================================================
-- 5) brain_review_comments — Threaded، عام (review_object_id = null)
-- أو مربوط بعنصر مراجعة محدد.
-- ============================================================
create table if not exists public.brain_review_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_object_id uuid references public.brain_review_objects(id) on delete cascade,
  parent_comment_id uuid references public.brain_review_comments(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  mentions uuid[] not null default '{}',
  is_resolved boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_brain_review_comments_document on public.brain_review_comments(document_id);
create index if not exists idx_brain_review_comments_object on public.brain_review_comments(review_object_id);

drop trigger if exists on_brain_review_comments_touch on public.brain_review_comments;
create trigger on_brain_review_comments_touch before update on public.brain_review_comments
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 6) brain_review_events — سجل نشاط واحد شامل (بيغطي Approval History
-- + Reviewer Actions معًا) — نفس مصدر Review Timeline في الـ Dashboard.
-- ============================================================
create table if not exists public.brain_review_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_brain_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null check (event_type in (
    'object_reviewed', 'comment_added', 'comment_resolved', 'validation_run',
    'gate_checked', 'approved', 'rejected', 'changes_requested', 'revalidation_triggered'
  )),
  actor_id uuid references public.profiles(id) on delete set null,
  review_object_id uuid references public.brain_review_objects(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_brain_review_events_document on public.brain_review_events(document_id, created_at desc);

-- ============================================================
-- 7) RLS — نفس نمط internal_read_/internal_write_ المتّبع في كل جدول
-- جديد هذا الموسم.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'brain_review_objects', 'brain_review_object_versions', 'brain_review_object_dependencies',
    'brain_review_validation_reports', 'brain_review_comments', 'brain_review_events'
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
-- 8) تسجيل مهمة الذكاء الاصطناعي الجديدة (نفس نمط كل مهمة سابقة).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('brain_review_validation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- انتهى 0053
-- ============================================================
