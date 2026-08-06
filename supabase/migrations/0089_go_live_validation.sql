-- ============================================================
-- 0089 — مركز التحقّق بعد الترحيل وقبول الأعمال وشهادة الإطلاق (Enterprise
-- Post-Migration Verification, Business Acceptance & Go-Live Validation) —
-- المرحلة ٧
--
-- فلسفة: *Migration is NOT Finished Until Business Confirms Success.*
-- خط الدفاع الأخير: تحقّق تقني وتجاري + اعتماد الأقسام والفروع + UAT +
-- شهادة إطلاق رسمية لا تُصدَر إلا بعد نجاح كل الجهات.
--
-- **بناء فوق الموجود:** يستهلك تنفيذ المرحلة ٦ (0088) والمحاكاة (0087)
-- وMapping (0084). الدروس تُرقّى للذاكرة المؤسسية (0082). لا يعدّل أي موديول.
--
-- **آمن على البيانات:** جداول تحقّق/اعتماد جديدة فقط. التراجع في
-- 0089_go_live_validation_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) عملية التحقّق — واحدة لكل تنفيذ ترحيل
-- ============================================================

create table if not exists public.go_live_verifications (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid references public.migration_executions(id) on delete set null,
  source_id     uuid references public.migration_sources(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,

  status        text not null default 'draft'
    check (status in ('draft','verifying','awaiting_acceptance','certified','rejected','closed')),

  data_match    boolean not null default false,
  verification_score      integer not null default 0 check (verification_score between 0 and 100),
  business_acceptance_score integer not null default 0 check (business_acceptance_score between 0 and 100),
  health_score  integer not null default 0 check (health_score between 0 and 100),
  final_score   integer not null default 0 check (final_score between 0 and 100),
  go_live_status text not null default 'not_ready'
    check (go_live_status in ('not_ready','conditional','ready','live')),

  open_issues   integer not null default 0,
  certificate_id uuid,
  -- {dataVerification, business, health, kpi, checklist, scenarios, lessons}.
  report        jsonb not null default '{}'::jsonb,
  ai_summary    text not null default '',
  promoted_to_org_memory boolean not null default false,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_gl_ver_source on public.go_live_verifications (source_id, created_at desc);
create index if not exists idx_gl_ver_project on public.go_live_verifications (project_id, created_at desc);
create index if not exists idx_gl_ver_status on public.go_live_verifications (status, created_at desc);


-- ============================================================
-- ٢) التحقّق من البيانات لكل كيان (Source ↔ Production)
-- ============================================================

create table if not exists public.go_live_data_checks (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.go_live_verifications(id) on delete cascade,
  entity        text not null,
  label         text not null default '',
  source_count  integer not null default 0,
  production_count integer not null default 0,
  difference    integer not null default 0,
  matched       boolean not null default false,
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists idx_gl_data_ver on public.go_live_data_checks (verification_id);


-- ============================================================
-- ٣) اعتماد الأقسام
-- ============================================================

create table if not exists public.go_live_departments (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.go_live_verifications(id) on delete cascade,
  department    text not null,
  label         text not null default '',
  checklist     jsonb not null default '[]'::jsonb,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes         text,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_role  text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_gl_dept_ver on public.go_live_departments (verification_id, status);


-- ============================================================
-- ٤) اعتماد الفروع (Branch Acceptance)
-- ============================================================

create table if not exists public.go_live_branches (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.go_live_verifications(id) on delete cascade,
  branch_name   text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes         text,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_role  text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_gl_branch_ver on public.go_live_branches (verification_id, status);


-- ============================================================
-- ٥) User Acceptance Testing (UAT)
-- ============================================================

create table if not exists public.go_live_uat (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.go_live_verifications(id) on delete cascade,
  scenario      text not null,
  department    text,
  verdict       text not null default 'pending' check (verdict in ('pending','pass','fail','comment','issue')),
  comment       text,
  created_by    uuid references auth.users(id) on delete set null,
  actor_role    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_gl_uat_ver on public.go_live_uat (verification_id, verdict);


-- ============================================================
-- ٦) المشكلات المُبلَّغة (Open/Closed Issues)
-- ============================================================

create table if not exists public.go_live_issues (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.go_live_verifications(id) on delete cascade,
  title         text not null,
  severity      text not null default 'medium' check (severity in ('critical','high','medium','low')),
  status        text not null default 'open' check (status in ('open','closed')),
  detail        text,
  resolution    text,
  reported_by   uuid references auth.users(id) on delete set null,
  closed_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create index if not exists idx_gl_issue_ver on public.go_live_issues (verification_id, status);


-- ============================================================
-- ٧) شهادات الإطلاق (Go Live Certificates)
-- ============================================================

create table if not exists public.go_live_certificates (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.go_live_verifications(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  project_name  text not null default '',
  migration_version text not null default '',
  verification_score integer not null default 0,
  business_acceptance_score integer not null default 0,
  final_score   integer not null default 0,
  go_live_status text not null default 'ready',
  approvers     jsonb not null default '[]'::jsonb,
  lessons       jsonb not null default '[]'::jsonb,
  issued_by     uuid references auth.users(id) on delete set null,
  issued_at     timestamptz not null default now()
);

create index if not exists idx_gl_cert_ver on public.go_live_certificates (verification_id);


-- ============================================================
-- ٨) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $gl_seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('migration_golive_verification', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $gl_seed$;


-- ============================================================
-- ٩) أمان مستوى الصف
-- ============================================================

do $gl_rls$
declare t text;
begin
  foreach t in array array[
    'go_live_verifications', 'go_live_data_checks', 'go_live_departments',
    'go_live_branches', 'go_live_uat', 'go_live_issues', 'go_live_certificates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $gl_rls$;


-- ============================================================
-- ١٠) touch updated_at
-- ============================================================

drop trigger if exists on_go_live_verifications_touch on public.go_live_verifications;
create trigger on_go_live_verifications_touch before update on public.go_live_verifications
  for each row execute procedure public.touch_updated_at();
