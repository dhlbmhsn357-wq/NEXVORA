-- ============================================================
-- 0091 — جسر الحمل (Load Bridge) — إغلاق فجوة الضخّ
--
-- يُكمِل محرّك الترحيل الحقيقي (0088): بعد أن يُحوّل ويتحقّق من الصفوف،
-- **نُثبّت المخرجات المُحوَّلة** ونُصدّرها بصيغة جاهزة للاستيراد (CSV/JSON/
-- SQL)، ونُعرّف «وجهات حمل» (ملف تصدير أو اتصال مباشر) مع مطابقة أعداد.
--
-- **بناء فوق الموجود:** يستهلك مخرجات التنفيذ (0088) وقواعد التحويل (0086).
-- لا يعدّل جداول سابقة — جداول جسر جديدة فقط.
--
-- **آمن على البيانات:** أسرار الوجهات مُشفَّرة (secret_encrypted، نفس نمط
-- 0083). لا اتصال صادر مباشر بلا تهيئة صريحة. التراجع في
-- 0091_load_bridge_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) مجموعات البيانات المُحوَّلة المُثبَّتة — مخرجات جاهزة للحمل لكل كيان
-- ============================================================

create table if not exists public.migration_loaded_datasets (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references public.migration_executions(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  entity        text not null,
  label         text not null default '',
  format        text not null default 'json' check (format in ('json','csv','sql')),
  artifact_key  text not null default '',
  -- fallback: تخزين مضمّن لو تعذّر رفع الـartifact (مجموعات صغيرة فقط).
  inline_data   jsonb,
  row_count     integer not null default 0,
  checksum      text not null default '',
  size_bytes    bigint not null default 0,
  status        text not null default 'ready' check (status in ('ready','failed')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_lb_dataset_exec on public.migration_loaded_datasets (execution_id, entity);
create index if not exists idx_lb_dataset_project on public.migration_loaded_datasets (project_id, created_at desc);


-- ============================================================
-- ٢) وجهات الحمل — تعريف نظام الهدف (ملف تصدير أو اتصال مباشر)
-- ============================================================

create table if not exists public.migration_load_targets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete cascade,
  name          text not null,
  target_type   text not null default 'sql_file'
    check (target_type in ('sql_file','csv_bundle','postgres','rest_api','supabase')),
  -- إعدادات غير سرّية (جدول الهدف، نقطة النهاية، سياسة التعارض…).
  config        jsonb not null default '{}'::jsonb,
  -- السرّ مُشفَّر (connection string / API token) — لا نصّ صريح أبدًا.
  secret_encrypted text,
  configured    boolean not null default false,
  status        text not null default 'draft' check (status in ('draft','configured','error')),
  last_test     jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_lb_target_project on public.migration_load_targets (project_id, created_at desc);


-- ============================================================
-- ٣) عمليات الحمل — محاولة حمل مخرجات تنفيذ إلى وجهة + مطابقة
-- ============================================================

create table if not exists public.migration_load_runs (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references public.migration_executions(id) on delete cascade,
  target_id     uuid references public.migration_load_targets(id) on delete set null,
  project_id    uuid references public.projects(id) on delete cascade,

  -- export: بناء حزمة قابلة للتنزيل. direct: كتابة مباشرة في الوجهة.
  mode          text not null default 'export' check (mode in ('export','direct')),
  format        text not null default 'sql' check (format in ('json','csv','sql')),
  status        text not null default 'pending'
    check (status in ('pending','running','completed','failed','partial')),

  total_rows    integer not null default 0,
  loaded_rows   integer not null default 0,
  failed_rows   integer not null default 0,
  -- هل طابقت الأعداد المُحمَّلة المتوقَّع من التنفيذ؟
  reconciled    boolean not null default false,
  reconciliation jsonb not null default '{}'::jsonb,

  -- مفتاح حزمة التصدير في التخزين (للتنزيل عبر رابط موقّع).
  package_key   text not null default '',
  detail        jsonb not null default '{}'::jsonb,
  error         text,

  started_by    uuid references auth.users(id) on delete set null,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_lb_run_exec on public.migration_load_runs (execution_id, created_at desc);
create index if not exists idx_lb_run_project on public.migration_load_runs (project_id, created_at desc);


-- ============================================================
-- ٤) أمان مستوى الصف
-- ============================================================

do $lb_rls$
declare t text;
begin
  foreach t in array array[
    'migration_loaded_datasets', 'migration_load_targets', 'migration_load_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $lb_rls$;


-- ============================================================
-- ٥) touch updated_at
-- ============================================================

drop trigger if exists on_migration_load_targets_touch on public.migration_load_targets;
create trigger on_migration_load_targets_touch before update on public.migration_load_targets
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_migration_load_runs_touch on public.migration_load_runs;
create trigger on_migration_load_runs_touch before update on public.migration_load_runs
  for each row execute procedure public.touch_updated_at();
