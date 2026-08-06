-- ============================================================
-- 0088 — محرّك الترحيل الحقيقي (Enterprise Production Migration Engine) —
-- المرحلة ٦
--
-- Mission Critical: Safe · Recoverable · Auditable · Incremental ·
-- Repeatable · Zero Data Loss. لا يبدأ إلا بعد محاكاة معتمَدة وغير محظورة
-- (0087) + نسخة احتياطية إلزامية + اجتياز فحوص ما قبل التنفيذ.
--
-- **بناء فوق الموجود:** يستهلك المحاكاة المعتمَدة (0087) ومحرّك التحويل
-- (0086) وMapping (0084) والعلاقات (0083). يعيد استخدام الطابور (0073).
--
-- **آمن على البيانات:** جداول تحكّم/تدقيق جديدة فقط. الأسرار تُنقّى
-- (REDACTED). التراجع في 0088_production_migration_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) عمليات التنفيذ — عملية لكل ترحيل حقيقي
-- ============================================================

create table if not exists public.migration_executions (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.migration_sources(id) on delete cascade,
  simulation_id uuid references public.migration_simulations(id) on delete set null,
  pipeline_id   uuid references public.transformation_pipelines(id) on delete set null,
  project_id    uuid references public.projects(id) on delete cascade,

  status        text not null default 'draft'
    check (status in ('draft','preflight','backing_up','ready','running','paused','completed','failed','rolling_back','rolled_back','aborted')),
  phase         text not null default 'idle',

  backup_id     uuid,
  total_entities integer not null default 0,
  total_rows    integer not null default 0,
  processed_rows integer not null default 0,
  migrated_rows integer not null default 0,
  failed_rows   integer not null default 0,
  total_tasks   integer not null default 0,
  completed_tasks integer not null default 0,
  failed_tasks  integer not null default 0,

  chunk_size    integer not null default 1000,
  worker_count  integer not null default 4,
  approval_score integer not null default 0 check (approval_score between 0 and 100),
  blocked       boolean not null default false,
  blockers      text[] not null default '{}',

  progress      integer not null default 0 check (progress between 0 and 100),
  speed_rows_per_sec integer not null default 0,

  -- {dependencyPlan, rollbackPackage, reports, preflight}. لا صفوف خام.
  detail        jsonb not null default '{}'::jsonb,
  error         text,
  promoted_to_org_memory boolean not null default false,

  started_by    uuid references auth.users(id) on delete set null,
  approved_by   uuid references auth.users(id) on delete set null,
  started_at    timestamptz,
  paused_at     timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_pm_exec_source on public.migration_executions (source_id, created_at desc);
create index if not exists idx_pm_exec_project on public.migration_executions (project_id, created_at desc);
create index if not exists idx_pm_exec_status on public.migration_executions (status, created_at desc);


-- ============================================================
-- ٢) النسخ الاحتياطية الإلزامية
-- ============================================================

create table if not exists public.migration_backups (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid references public.migration_executions(id) on delete cascade,
  source_id     uuid references public.migration_sources(id) on delete cascade,
  backup_key    text not null,
  scope         jsonb not null default '{}'::jsonb,
  size_bytes    bigint not null default 0,
  duration_ms   integer not null default 0,
  restore_command text not null default '',
  status        text not null default 'creating' check (status in ('creating','ready','failed','restored')),
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pm_backup_exec on public.migration_backups (execution_id, created_at desc);


-- ============================================================
-- ٣) مهام التنفيذ — وحدة لكل (كيان × دفعة) — أساس الاستئناف والتوازي
-- ============================================================

create table if not exists public.migration_execution_tasks (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references public.migration_executions(id) on delete cascade,
  entity        text not null,
  label         text not null default '',
  task_order    integer not null,
  level         integer not null default 0,
  chunk_index   integer not null default 0,
  chunk_size    integer not null default 1000,
  row_start     integer not null default 0,
  row_end       integer not null default 0,

  status        text not null default 'pending'
    check (status in ('pending','running','completed','failed','skipped','review')),
  processed     integer not null default 0,
  migrated      integer not null default 0,
  failed        integer not null default 0,
  retry_count   integer not null default 0,
  -- نقطة تحقّق للاستئناف من آخر صفّ ناجح داخل الدفعة.
  checkpoint    jsonb not null default '{}'::jsonb,
  last_error    text,
  duration_ms   integer not null default 0,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pm_task_exec on public.migration_execution_tasks (execution_id, task_order);
create index if not exists idx_pm_task_status on public.migration_execution_tasks (execution_id, status, level);


-- ============================================================
-- ٤) سجلّ التدقيق (Audit Trail) — كل شيء، بأسرار منقّاة
-- ============================================================

create table if not exists public.migration_execution_events (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references public.migration_executions(id) on delete cascade,
  event_type    text not null,
  actor_id      uuid references auth.users(id) on delete set null,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pm_events_exec on public.migration_execution_events (execution_id, created_at desc);


-- ============================================================
-- ٥) فحوص ما قبل التنفيذ
-- ============================================================

create table if not exists public.migration_preflight_checks (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references public.migration_executions(id) on delete cascade,
  check_key     text not null,
  label         text not null default '',
  passed        boolean not null default false,
  blocking      boolean not null default false,
  detail        text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists idx_pm_preflight_exec on public.migration_preflight_checks (execution_id);


-- ============================================================
-- ٦) حزم التراجع (Rollback Packages)
-- ============================================================

create table if not exists public.migration_rollback_packages (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references public.migration_executions(id) on delete cascade,
  package_key   text not null default '',
  steps         jsonb not null default '[]'::jsonb,
  status        text not null default 'ready' check (status in ('ready','executing','executed','failed')),
  data_loss     boolean not null default false,
  duration_ms   integer not null default 0,
  executed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pm_rollback_exec on public.migration_rollback_packages (execution_id, created_at desc);


-- ============================================================
-- ٧) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $pm_seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('migration_recovery', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $pm_seed$;


-- ============================================================
-- ٨) أمان مستوى الصف
-- ============================================================

do $pm_rls$
declare t text;
begin
  foreach t in array array[
    'migration_executions', 'migration_backups', 'migration_execution_tasks',
    'migration_execution_events', 'migration_preflight_checks', 'migration_rollback_packages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $pm_rls$;


-- ============================================================
-- ٩) touch updated_at
-- ============================================================

drop trigger if exists on_migration_executions_touch on public.migration_executions;
create trigger on_migration_executions_touch before update on public.migration_executions
  for each row execute procedure public.touch_updated_at();
