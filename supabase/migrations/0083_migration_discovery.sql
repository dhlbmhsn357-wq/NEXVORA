-- ============================================================
-- 0083 — منصّة اكتشاف الترحيل وذكاء المصادر (Migration Discovery &
-- Source Intelligence Platform) — المرحلة ١
--
-- **ليست ميزة استيراد.** منصّة ذكاء تفهم أي نظام قديم بالكامل *قبل* أي
-- ترحيل. الفلسفة: Understand Before Migrate. هذه المرحلة **لا تنقل أي
-- بيانات** — تبني معرفة مرجعية لكل مراحل الترحيل التالية.
--
-- **بناء فوق الموجود:** تكتب معرفتها في Knowledge Hub (٠٠٧٧) وقد تُرقّى
-- للذاكرة المؤسسية (٠٨٢) بموافقة المدير. لا تعدّل أي موديول قائم.
--
-- **أمان:** الأسرار (Connection Strings/كلمات مرور) تُخزَّن **مشفَّرة
-- AES-256-GCM** في secret_encrypted فقط — لا نصّ صريح أبدًا، ولا تُعاد
-- للعميل، ولا تُسجَّل. طبقة الاتصال الحيّ معزولة ومؤجَّلة.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0083_migration_discovery_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) المصادر المسجَّلة — أي مصدر بيانات (قاعدة/ملف/API/نظام قديم)
--
-- connection_mode يحدّد كيف نفهم المصدر:
--   file_upload   — ملف مرفوع (CSV/JSON/...) — حيّ اليوم، بلا اعتماد.
--   schema_upload — رفع Schema Dump/DDL — حيّ اليوم، بلا اعتماد. الأأمن
--                   لقواعد الإنتاج: العميل يصدّر البنية فقط.
--   live_connection — اتصال مباشر — معرَّف كواجهة، مؤجَّل لطبقة معزولة.
-- ============================================================

create table if not exists public.migration_sources (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete cascade,

  name          text not null,
  -- نوع المصدر — نصّ حرّ يطابق كتالوج الكود (source-types.ts) لدعم أي
  -- نوع حالي أو مستقبلي بلا تعديل schema.
  source_type   text not null default 'generic',
  connection_mode text not null default 'schema_upload'
    check (connection_mode in ('file_upload','schema_upload','live_connection')),

  status        text not null default 'draft'
    check (status in ('draft','connected','analyzing','analyzed','failed','disabled')),

  -- إعدادات غير سرّية فقط (host/port/database/ssl/نوع المصادقة...).
  -- **ممنوع وضع أي كلمة مرور أو token هنا.**
  connection_config jsonb not null default '{}'::jsonb,
  -- السرّ مشفَّر AES-256-GCM (v1:iv:tag:cipher). null لو المصدر بلا سرّ.
  secret_encrypted  text,

  -- آخر اختبار اتصال/صلاحية: {ok, durationMs, version, dbType, tableCount,
  -- approxSize, issues[]}.
  last_connection_test jsonb,
  last_tested_at    timestamptz,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_migration_sources_project
  on public.migration_sources (project_id, created_at desc);
create index if not exists idx_migration_sources_status
  on public.migration_sources (status);


-- ============================================================
-- ٢) لقطات التحليل — تشغيلة اكتشاف واحدة لمصدر (قابلة للإصدار والاستئناف)
--
-- raw_schema يحمل البنية المُستخرَجة كاملةً (schemas/tables/columns/keys/
-- indexes/...). progress/checkpoint لدعم التحليل على دفعات مع الاستئناف.
-- ============================================================

create table if not exists public.migration_snapshots (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.migration_sources(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,

  version       integer not null default 1,
  status        text not null default 'pending'
    check (status in ('pending','extracting','analyzing','completed','failed')),
  progress      integer not null default 0 check (progress between 0 and 100),
  checkpoint    jsonb,

  -- البنية المُستخرَجة المُطبَّعة (schema-model.ts).
  raw_schema    jsonb not null default '{}'::jsonb,
  -- إحصاءات: {schemas, tables, views, columns, rowCountTotal, approxSizeBytes,
  -- encoding, collation}.
  stats         jsonb not null default '{}'::jsonb,

  error         text,
  triggered_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint migration_snapshots_version_unique unique (source_id, version)
);

create index if not exists idx_migration_snapshots_source
  on public.migration_snapshots (source_id, version desc);


-- ============================================================
-- ٣) الكيانات المكتشَفة — الكشف الدلالي (Semantic Detection)
--
-- «tbl_customer / clients / crm_client» → كيان Customer واحد. المعنى لا
-- الاسم. canonical_entity هو الكيان القياسي؛ source_objects الجداول
-- الفعلية التي تمثّله.
-- ============================================================

create table if not exists public.migration_entities (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references public.migration_snapshots(id) on delete cascade,
  source_id     uuid not null references public.migration_sources(id) on delete cascade,

  canonical_entity text not null,          -- customer / invoice / order / employee ...
  display_name  text not null default '',
  data_class    text not null default 'unknown'
    check (data_class in (
      'master','reference','transactional','configuration',
      'audit','log','historical','temporary','unknown'
    )),
  -- الجداول/المجموعات الفعلية التي تمثّل هذا الكيان.
  source_objects text[] not null default '{}',
  confidence    integer not null default 50 check (confidence between 0 and 100),
  detail        jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_entities_snapshot
  on public.migration_entities (snapshot_id);


-- ============================================================
-- ٤) العلاقات المكتشَفة — رسم العلاقات وذكاؤها
--
-- kind يصنّف العلاقة (parent_child/many_to_many/.../broken/missing).
-- weak/broken/missing تُبرَز للمراجعة البشرية.
-- ============================================================

create table if not exists public.migration_relationships (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references public.migration_snapshots(id) on delete cascade,
  source_id     uuid not null references public.migration_sources(id) on delete cascade,

  from_object   text not null,
  to_object     text not null,
  kind          text not null default 'parent_child'
    check (kind in (
      'parent_child','one_to_one','many_to_many','recursive',
      'circular','weak','missing','broken'
    )),
  via_columns   text[] not null default '{}',
  confidence    integer not null default 50 check (confidence between 0 and 100),
  detail        jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_relationships_snapshot
  on public.migration_relationships (snapshot_id);


-- ============================================================
-- ٥) التقرير الذكي — الملخّص + الجاهزية + الجودة + المخاطر + المجالات
--
-- المرجع الرسمي لكل مراحل الترحيل التالية. يُبنى من التحليل الحتمي +
-- تهذيب الذكاء الاصطناعي.
-- ============================================================

create table if not exists public.migration_reports (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references public.migration_snapshots(id) on delete cascade,
  source_id     uuid not null references public.migration_sources(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,

  -- المجالات المكتشَفة (erp/crm/lms/... — قد تكون أكثر من واحد).
  detected_domains text[] not null default '{}',
  system_type   text not null default 'unknown',

  -- درجات محسوبة حتميًا (٠-١٠٠).
  quality_score   integer not null default 0 check (quality_score between 0 and 100),
  risk_score      integer not null default 0 check (risk_score between 0 and 100),
  readiness_score integer not null default 0 check (readiness_score between 0 and 100),

  -- تفاصيل مهيكلة: {quality{...}, risks[], businessFlows[], modules[],
  -- humanReviewNeeded[], complexity}.
  detail        jsonb not null default '{}'::jsonb,
  -- ملخّص الذكاء الاصطناعي النصّي (قابل للقراءة البشرية).
  ai_summary    text not null default '',

  -- هل رُقّي هذا التحليل للذاكرة المؤسسية؟ (بموافقة المدير فقط).
  promoted_to_org_memory boolean not null default false,

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_reports_snapshot
  on public.migration_reports (snapshot_id);
create index if not exists idx_migration_reports_source
  on public.migration_reports (source_id, created_at desc);


-- ============================================================
-- ٦) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('migration_source_analysis', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $seed$;


-- ============================================================
-- ٧) أمان مستوى الصف — قراءة للمصادَق عليهم، كتابة لـ service_role.
-- التقييد الفعلي بالدور (Director/Admin) في server actions.
-- ============================================================

do $rls$
declare t text;
begin
  foreach t in array array[
    'migration_sources', 'migration_snapshots', 'migration_entities',
    'migration_relationships', 'migration_reports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format(
      'create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t
    );
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format(
      'create policy %I_service_all on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $rls$;


-- ============================================================
-- ٨) touch updated_at
-- ============================================================

drop trigger if exists on_migration_sources_touch on public.migration_sources;
create trigger on_migration_sources_touch before update on public.migration_sources
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_migration_snapshots_touch on public.migration_snapshots;
create trigger on_migration_snapshots_touch before update on public.migration_snapshots
  for each row execute procedure public.touch_updated_at();
