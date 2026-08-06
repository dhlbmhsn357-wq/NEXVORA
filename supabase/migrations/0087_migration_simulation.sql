-- ============================================================
-- 0087 — مركز محاكاة الترحيل (Enterprise Migration Simulation, Digital Twin
-- & AI Validation Platform) — المرحلة ٥
--
-- فلسفة: *Never Touch Production Before Simulation*. يبني نسخة رقمية
-- (Digital Twin) في الذاكرة، يعيد تنفيذ كل خطوات الترحيل عليها افتراضيًا،
-- يقارن بالمصدر، ويُصدر Migration Approval Score يمنع الترحيل الحقيقي عند
-- وجود مخاطر حرجة.
--
-- **بناء فوق الموجود:** يستهلك محرّك التحويل المعتمَد (0086) وMapping (0084)
-- والعلاقات (0083). القرارات المعتمَدة تُرقّى للذاكرة المؤسسية (0082).
--
-- **آمن على البيانات:** جداول جديدة فقط، **لا تُخزَّن صفوف خام** — مشتقّات
-- (مقاييس + خطوات + مشاكل بعيّنات مقصوصة) فقط. التراجع في
-- 0087_migration_simulation_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) المحاكاة — تشغيل واحد لكل مصدر (نسخ متعدّدة/إصدارات)
-- ============================================================

create table if not exists public.migration_simulations (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.migration_sources(id) on delete cascade,
  pipeline_id   uuid references public.transformation_pipelines(id) on delete set null,
  project_id    uuid references public.projects(id) on delete cascade,

  status        text not null default 'running'
    check (status in ('draft','running','completed','failed','approved','rejected','archived')),
  version       integer not null default 1,
  domain        text not null default 'generic',

  total_source_rows integer not null default 0,
  total_target_rows integer not null default 0,
  migrated      integer not null default 0,
  skipped       integer not null default 0,
  archived_rows integer not null default 0,
  failed_rows   integer not null default 0,

  data_loss_count   integer not null default 0,
  broken_relations  integer not null default 0,
  business_failures integer not null default 0,
  critical_issues   integer not null default 0,

  approval_score    integer not null default 0 check (approval_score between 0 and 100),
  readiness_verdict text not null default 'not_ready'
    check (readiness_verdict in ('ready','ready_with_warnings','not_ready')),
  risk_level    text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  blocked       boolean not null default false,
  blockers      text[] not null default '{}',

  -- التقرير الشامل: {summary, steps, byEntity, issues, difference, relationships,
  -- business, risk, performance, failure, rollback, approval, recommendations}.
  report        jsonb not null default '{}'::jsonb,
  ai_summary    text not null default '',
  recommendations text[] not null default '{}',
  duration_ms   integer not null default 0,
  error         text,

  promoted_to_org_memory boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  decision_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_sim_source on public.migration_simulations (source_id, version desc);
create index if not exists idx_sim_project on public.migration_simulations (project_id, created_at desc);
create index if not exists idx_sim_status on public.migration_simulations (status, created_at desc);


-- ============================================================
-- ٢) خطوات إعادة التنفيذ — سجلّ خطوة بخطوة (أي خطوة فشلت ولماذا)
-- ============================================================

create table if not exists public.migration_simulation_steps (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.migration_simulations(id) on delete cascade,
  step_order    integer not null,
  stage         text not null,
  name          text not null,
  status        text not null default 'passed' check (status in ('passed','warning','failed')),
  processed     integer not null default 0,
  failed        integer not null default 0,
  estimated_ms  integer not null default 0,
  detail        jsonb not null default '{}'::jsonb,
  errors        text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_sim_steps on public.migration_simulation_steps (simulation_id, step_order);


-- ============================================================
-- ٣) كتالوج المشاكل — قابل للتفسير (مكان + سبب + قاعدة)، مشتقّات فقط
-- ============================================================

create table if not exists public.migration_simulation_issues (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.migration_simulations(id) on delete cascade,
  entity        text not null,
  category      text not null,
  issue_type    text not null,
  field         text not null default '*',
  severity      text not null default 'medium' check (severity in ('critical','high','medium','low')),
  count         integer not null default 1,
  message       text not null default '',
  rule_id       text,
  -- عيّنات تشخيصية مقصوصة فقط — لا صفّ خام كامل.
  samples       jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sim_issues on public.migration_simulation_issues (simulation_id, severity);


-- ============================================================
-- ٤) التقارير المنفصلة — ٨ أنواع (Summary/Difference/Business/Risk/...)
-- ============================================================

create table if not exists public.migration_simulation_reports (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.migration_simulations(id) on delete cascade,
  report_type   text not null
    check (report_type in ('summary','difference','relationships','business','risk','performance','failure','rollback','recommendations','validation')),
  content       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sim_reports on public.migration_simulation_reports (simulation_id, report_type);


-- ============================================================
-- ٥) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $sim_seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('migration_simulation_validation', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $sim_seed$;


-- ============================================================
-- ٦) أمان مستوى الصف
-- ============================================================

do $sim_rls$
declare t text;
begin
  foreach t in array array[
    'migration_simulations', 'migration_simulation_steps',
    'migration_simulation_issues', 'migration_simulation_reports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $sim_rls$;


-- ============================================================
-- ٧) touch updated_at
-- ============================================================

drop trigger if exists on_migration_simulations_touch on public.migration_simulations;
create trigger on_migration_simulations_touch before update on public.migration_simulations
  for each row execute procedure public.touch_updated_at();
