-- ============================================================
-- 0086 — محرّك التحويل الذكي وقواعد الترحيل (Intelligent Transformation &
-- Migration Rules Engine) — المرحلة ٤
--
-- كل ترحيل هو في الحقيقة **تحويل**. هذه المرحلة تبني **محرّك التحويل**
-- الذي سيُستخدم في المحاكاة (٥) والترحيل الحقيقي (٦). **لا ترحيل، لا
-- محاكاة، لا تنفيذ على Production** — بناء المحرّك والتحقّق من جاهزيته فقط.
--
-- **بناء فوق الموجود:** يشتقّ القواعد من Mapping (٠٠٨٤) والتنظيف (٠٠٨٥).
-- القواعد المعتمَدة تُرقَّى للذاكرة المؤسسية (٠٨٢). لا يعدّل أي موديول.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0086_transformation_engine_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) خطوط التحويل — Pipeline واحد لكل مصدر
-- ============================================================

create table if not exists public.transformation_pipelines (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.migration_sources(id) on delete cascade,
  blueprint_id  uuid,
  project_id    uuid references public.projects(id) on delete cascade,

  status        text not null default 'draft'
    check (status in ('draft','in_review','approved','failed','generating')),
  version       integer not null default 1,

  domain        text not null default 'generic',
  confidence_avg  integer not null default 0 check (confidence_avg between 0 and 100),
  coverage      integer not null default 0 check (coverage between 0 and 100),
  complexity    text not null default 'low',
  -- {stats, ruleCounts, risks[], warnings[], performanceEstimate, graph}.
  report        jsonb not null default '{}'::jsonb,
  ai_summary    text not null default '',
  recommendations text[] not null default '{}',
  promoted_to_org_memory boolean not null default false,
  error         text,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tr_pipelines_source on public.transformation_pipelines (source_id, version desc);
create index if not exists idx_tr_pipelines_project on public.transformation_pipelines (project_id, created_at desc);


-- ============================================================
-- ٢) قواعد التحويل — قاعدة لكل حقل هدف
-- ============================================================

create table if not exists public.transformation_rules (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.transformation_pipelines(id) on delete cascade,

  target_field  text not null,
  source_fields text[] not null default '{}',
  kind          text not null,
  stage         text not null default 'normalize',
  config        jsonb not null default '{}'::jsonb,
  -- شرط اختياري (IF): {field, operator, value}.
  condition     jsonb,
  confidence    integer not null default 0 check (confidence between 0 and 100),
  reason        text not null default '',
  source        text not null default 'deterministic'
    check (source in ('deterministic','ai','manual','library')),
  enabled       boolean not null default true,

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected','disabled')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_tr_rules_pipeline on public.transformation_rules (pipeline_id, stage);


-- ============================================================
-- ٣) قواعد العمل — قرار مصير السجلّ (ترحيل/تخطّي/أرشفة)
-- ============================================================

create table if not exists public.transformation_business_rules (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.transformation_pipelines(id) on delete cascade,

  entity        text not null,
  title         text not null,
  -- {op: and|or, conditions: [{field, operator, value}]}.
  condition     jsonb not null default '{}'::jsonb,
  action        text not null default 'migrate'
    check (action in ('migrate','skip','archive')),
  confidence    integer not null default 0 check (confidence between 0 and 100),
  reason        text not null default '',
  enabled       boolean not null default true,

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected','disabled')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_tr_business_rules_pipeline on public.transformation_business_rules (pipeline_id);


-- ============================================================
-- ٤) إصدارات القاعدة/الـPipeline — تاريخ، اعتماد، تراجع
-- ============================================================

create table if not exists public.transformation_rule_versions (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.transformation_pipelines(id) on delete cascade,
  rule_id       uuid references public.transformation_rules(id) on delete set null,
  version       integer not null,
  action        text not null default 'generated'
    check (action in ('generated','approved','rejected','edited','disabled','rolled_back')),
  snapshot      jsonb not null default '{}'::jsonb,
  reason        text not null default '',
  actor_id      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tr_versions_pipeline on public.transformation_rule_versions (pipeline_id, created_at desc);


-- ============================================================
-- ٥) مكتبة قواعد التحويل — قابلة لإعادة الاستخدام حسب المجال
-- ============================================================

create table if not exists public.transformation_rule_library (
  id            uuid primary key default gen_random_uuid(),
  rule_key      text not null,
  domain        text not null default 'generic',
  kind          text not null,
  title         text not null,
  definition    jsonb not null default '{}'::jsonb,
  source_project_ids uuid[] not null default '{}',
  usage_count   integer not null default 0,
  approved      boolean not null default false,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint transformation_rule_library_key_unique unique (rule_key, domain)
);

create index if not exists idx_tr_library_domain on public.transformation_rule_library (domain, kind);


-- ============================================================
-- ٦) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('transformation_rule_generation', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $seed$;


-- ============================================================
-- ٧) أمان مستوى الصف
-- ============================================================

do $rls$
declare t text;
begin
  foreach t in array array[
    'transformation_pipelines', 'transformation_rules', 'transformation_business_rules',
    'transformation_rule_versions', 'transformation_rule_library'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $rls$;


-- ============================================================
-- ٨) touch updated_at
-- ============================================================

drop trigger if exists on_tr_pipelines_touch on public.transformation_pipelines;
create trigger on_tr_pipelines_touch before update on public.transformation_pipelines
  for each row execute procedure public.touch_updated_at();
