-- ============================================================
-- 0084 — محرّك الـMapping الذكي والتحويل الدلالي (Intelligent Schema
-- Mapping & Semantic Transformation Engine) — المرحلة ٢
--
-- إذا كانت المرحلة ١ «فهم النظام القديم»، فالمرحلة ٢ «فهم كيف يتحوّل
-- القديم إلى الجديد». **لا ترحيل بيانات، لا تنظيف، لا إنشاء Migration** —
-- بناء الفهم الكامل للانتقال فقط. المخطّط الناتج (Migration Blueprint) هو
-- المرجع الرسمي لمراحل الترحيل التالية.
--
-- **بناء فوق الموجود:** يستهلك نتائج المرحلة ١ (٠٠٨٣)، ويُرقّى المعتمَد
-- للذاكرة المؤسسية (٠٨٢). لا يعدّل أي موديول قائم.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0084_schema_mapping_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) المخطّطات — Migration Blueprint واحد لكل مصدر مُحلَّل
-- ============================================================

create table if not exists public.migration_blueprints (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.migration_sources(id) on delete cascade,
  snapshot_id   uuid,
  project_id    uuid references public.projects(id) on delete cascade,

  status        text not null default 'draft'
    check (status in ('draft','in_review','approved','failed','generating')),
  version       integer not null default 1,

  confidence_avg  integer not null default 0 check (confidence_avg between 0 and 100),
  complexity      text not null default 'low',
  detected_template text,
  -- إحصاءات: {objects, entities, fields, mappedFields, relationships, rules,
  -- reviewCount}.
  stats         jsonb not null default '{}'::jsonb,
  ai_summary    text not null default '',
  recommendations text[] not null default '{}',

  promoted_to_org_memory boolean not null default false,
  error         text,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_migration_blueprints_source
  on public.migration_blueprints (source_id, version desc);
create index if not exists idx_migration_blueprints_project
  on public.migration_blueprints (project_id, created_at desc);


-- ============================================================
-- ٢) مطابقة الكيانات — جدول/جداول قديمة → كيان قياسي جديد
-- ============================================================

create table if not exists public.migration_entity_mappings (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.migration_blueprints(id) on delete cascade,

  old_objects   text[] not null default '{}',
  canonical_entity text not null,
  canonical_label  text not null default '',
  confidence    integer not null default 0 check (confidence between 0 and 100),
  reason        text not null default '',
  alternatives  jsonb not null default '[]'::jsonb,

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_entity_mappings_bp
  on public.migration_entity_mappings (blueprint_id);


-- ============================================================
-- ٣) مطابقة الحقول — عمود قديم → حقل جديد + قاعدة تحويل
--
-- kind: direct / split / merge / multi_source / unmapped.
-- ============================================================

create table if not exists public.migration_field_mappings (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.migration_blueprints(id) on delete cascade,

  old_object    text not null,
  old_field     text not null,
  new_entity    text not null,
  new_field     text,
  new_field_label text,
  kind          text not null default 'direct'
    check (kind in ('direct','split','merge','multi_source','unmapped')),
  -- {kind, description, valueMap?}.
  transformation jsonb not null default '{}'::jsonb,
  confidence    integer not null default 0 check (confidence between 0 and 100),
  reason        text not null default '',
  suggestions   jsonb not null default '[]'::jsonb,

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_field_mappings_bp
  on public.migration_field_mappings (blueprint_id, kind);


-- ============================================================
-- ٤) مطابقة العلاقات
-- ============================================================

create table if not exists public.migration_relationship_mappings (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.migration_blueprints(id) on delete cascade,

  from_object   text not null,
  to_object     text not null,
  from_entity   text,
  to_entity     text,
  old_kind      text not null default '',
  new_kind      text not null default 'weak',
  confidence    integer not null default 0 check (confidence between 0 and 100),
  note          text not null default '',

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_rel_mappings_bp
  on public.migration_relationship_mappings (blueprint_id);


-- ============================================================
-- ٥) قواعد العمل وتدفّقات العمل المستخرَجة
-- ============================================================

create table if not exists public.migration_mapping_rules (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.migration_blueprints(id) on delete cascade,

  rule_type     text not null default 'business_rule'
    check (rule_type in ('business_rule','workflow')),
  condition     text not null default '',
  result        text not null default '',
  detail        jsonb not null default '{}'::jsonb,
  confidence    integer not null default 0 check (confidence between 0 and 100),

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_mapping_rules_bp
  on public.migration_mapping_rules (blueprint_id, rule_type);


-- ============================================================
-- ٦) التعارضات — عناصر بلا مقابل تُعرَض لا تُتجاهَل
-- ============================================================

create table if not exists public.migration_mapping_conflicts (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.migration_blueprints(id) on delete cascade,

  conflict_type text not null
    check (conflict_type in ('unmapped_old','unmapped_new','unused_old')),
  subject       text not null,
  detail        text not null default '',
  resolved      boolean not null default false,

  created_at    timestamptz not null default now()
);

create index if not exists idx_migration_conflicts_bp
  on public.migration_mapping_conflicts (blueprint_id, resolved);


-- ============================================================
-- ٧) إصدارات المخطّط — تاريخ، اعتماد، تراجع
-- ============================================================

create table if not exists public.migration_blueprint_versions (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.migration_blueprints(id) on delete cascade,
  version       integer not null,
  action        text not null default 'generated'
    check (action in ('generated','approved','rejected','edited','rolled_back')),
  -- لقطة كاملة للمخطّط وقت الحدث (للتراجع والمقارنة).
  snapshot      jsonb not null default '{}'::jsonb,
  reason        text not null default '',
  actor_id      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint migration_blueprint_versions_unique unique (blueprint_id, version, action, created_at)
);

create index if not exists idx_migration_bp_versions
  on public.migration_blueprint_versions (blueprint_id, created_at desc);


-- ============================================================
-- ٨) قوالب الـMapping القابلة لإعادة الاستخدام (SAP→ERP...)
-- ============================================================

create table if not exists public.migration_mapping_templates (
  id            uuid primary key default gen_random_uuid(),
  template_key  text not null,
  label         text not null,
  domain        text not null default 'generic',
  -- خرائط الكيانات/الحقول القياسية القابلة لإعادة الاستخدام.
  mapping       jsonb not null default '{}'::jsonb,
  source_project_ids uuid[] not null default '{}',
  usage_count   integer not null default 0,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint migration_mapping_templates_key_unique unique (template_key)
);

create index if not exists idx_migration_templates_domain
  on public.migration_mapping_templates (domain);


-- ============================================================
-- ٩) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('schema_mapping_analysis', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $seed$;


-- ============================================================
-- ١٠) أمان مستوى الصف — قراءة للمصادَق عليهم، كتابة لـ service_role.
-- ============================================================

do $rls$
declare t text;
begin
  foreach t in array array[
    'migration_blueprints', 'migration_entity_mappings', 'migration_field_mappings',
    'migration_relationship_mappings', 'migration_mapping_rules',
    'migration_mapping_conflicts', 'migration_blueprint_versions', 'migration_mapping_templates'
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
-- ١١) touch updated_at
-- ============================================================

drop trigger if exists on_migration_blueprints_touch on public.migration_blueprints;
create trigger on_migration_blueprints_touch before update on public.migration_blueprints
  for each row execute procedure public.touch_updated_at();
