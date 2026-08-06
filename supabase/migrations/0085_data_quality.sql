-- ============================================================
-- 0085 — منصّة ذكاء جودة البيانات والتنظيف والتحقّق (AI Data Quality,
-- Cleansing & Validation Intelligence) — المرحلة ٣
--
-- المشكلة ليست نقل البيانات، بل أن بيانات العميل غالبًا سيّئة. لا يجوز
-- ترحيل بيانات سيّئة (Garbage In = Garbage Out). هذه المرحلة تجعل
-- البيانات صالحة/نظيفة/متماسكة/جاهزة — **بلا ترحيل ولا تحويل ولا تعديل
-- للأصل**.
--
-- **بناء فوق الموجود:** تستهلك نتائج المرحلة ١ (٠٠٨٣) والمرحلة ٢ (٠٠٨٤).
-- القواعد المعتمَدة تُرقَّى للذاكرة المؤسسية (٠٨٢). لا تعدّل أي موديول.
--
-- **أمان:** لا تُخزَّن الصفوف الخام؛ يُحلَّل في الذاكرة وتُحفَظ المشتقّات
-- فقط (مقاييس + مشاكل + تصحيحات مقترَحة). العمل على «نسخة عمل» — لا
-- تعديل تلقائي بلا اعتماد المدير. كل شيء قابل للتدقيق والتراجع.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0085_data_quality_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) تشغيلات جودة البيانات — تشغيلة تنظيف واحدة لمصدر
-- ============================================================

create table if not exists public.data_quality_runs (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.migration_sources(id) on delete cascade,
  blueprint_id  uuid,
  project_id    uuid references public.projects(id) on delete cascade,

  status        text not null default 'pending'
    check (status in ('pending','profiling','analyzing','completed','failed')),
  progress      integer not null default 0 check (progress between 0 and 100),
  checkpoint    jsonb,

  domain        text not null default 'generic',
  records       integer not null default 0,
  fields        integer not null default 0,
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  readiness_delta integer not null default 0,
  -- تقارير مهيكلة: {quality{...}, profiles[], ruleCounts, recommendations[]}.
  report        jsonb not null default '{}'::jsonb,
  ai_summary    text not null default '',
  version       integer not null default 1,

  error         text,
  triggered_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_dq_runs_source on public.data_quality_runs (source_id, version desc);
create index if not exists idx_dq_runs_project on public.data_quality_runs (project_id, created_at desc);


-- ============================================================
-- ٢) المشاكل المكتشَفة — ناقص/غير صالح/تكرار/سلامة مرجعية/قاعدة عمل
--
-- كل مشكلة تحمل تصحيحًا مقترَحًا (نسخة عمل) — لا يُطبَّق إلا بعد اعتماد
-- المدير. الثقة أقل من ٩٥ → مراجعة إلزامية.
-- ============================================================

create table if not exists public.data_quality_issues (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.data_quality_runs(id) on delete cascade,

  issue_type    text not null
    check (issue_type in ('missing','invalid','duplicate','orphan_record','missing_reference','broken_relation','business_rule')),
  object        text not null,
  field         text not null default '',
  row_index     integer not null default 0,
  value         text not null default '',
  detail        text not null default '',
  suggestion    text,
  confidence    integer not null default 0 check (confidence between 0 and 100),

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected','ignored')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_dq_issues_run on public.data_quality_issues (run_id, issue_type, status);


-- ============================================================
-- ٣) مجموعات التكرار — سجلّات متشابهة + إجراء مقترَح
-- ============================================================

create table if not exists public.data_quality_duplicates (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.data_quality_runs(id) on delete cascade,

  object        text not null,
  key_field     text not null default '',
  -- أعضاء المجموعة: [{rowIndex, value}].
  members       jsonb not null default '[]'::jsonb,
  match_method  text not null default 'fuzzy',
  similarity    integer not null default 0 check (similarity between 0 and 100),
  suggested_action text not null default 'manual_review'
    check (suggested_action in ('merge','keep_both','archive','manual_review')),

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected','ignored')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_dq_duplicates_run on public.data_quality_duplicates (run_id, status);


-- ============================================================
-- ٤) نسخة العمل — التصحيحات المقترَحة (لا تُطبَّق على الأصل)
--
-- كل تصحيح: قيمة قديمة → جديدة لخلية محدّدة. المعتمَدة تكوّن Clean Dataset
-- القابل للتصدير. لا تعديل للبيانات الأصلية إطلاقًا.
-- ============================================================

create table if not exists public.data_quality_changeset (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.data_quality_runs(id) on delete cascade,
  issue_id      uuid references public.data_quality_issues(id) on delete cascade,

  object        text not null,
  field         text not null,
  row_index     integer not null default 0,
  old_value     text not null default '',
  new_value     text not null default '',
  reason        text not null default '',
  confidence    integer not null default 0 check (confidence between 0 and 100),
  source        text not null default 'deterministic'
    check (source in ('deterministic','ai','manual')),

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists idx_dq_changeset_run on public.data_quality_changeset (run_id, status);


-- ============================================================
-- ٥) قواعد الجودة — قابلة لإعادة الاستخدام + تُرقَّى للذاكرة المؤسسية
-- ============================================================

create table if not exists public.data_quality_rules (
  id            uuid primary key default gen_random_uuid(),
  rule_key      text not null,
  rule_type     text not null
    check (rule_type in ('validation','normalization','business','cleaning')),
  domain        text not null default 'generic',
  title         text not null,
  description   text not null default '',
  definition    jsonb not null default '{}'::jsonb,
  source_project_ids uuid[] not null default '{}',
  usage_count   integer not null default 0,
  approved      boolean not null default false,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint data_quality_rules_key_unique unique (rule_key, domain)
);

create index if not exists idx_dq_rules_domain on public.data_quality_rules (domain, rule_type);


-- ============================================================
-- ٦) إصدارات التشغيلة — تاريخ، اعتماد، تراجع
-- ============================================================

create table if not exists public.data_quality_versions (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.data_quality_runs(id) on delete cascade,
  version       integer not null,
  action        text not null default 'generated'
    check (action in ('generated','approved','rejected','applied','rolled_back')),
  snapshot      jsonb not null default '{}'::jsonb,
  reason        text not null default '',
  actor_id      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_dq_versions_run on public.data_quality_versions (run_id, created_at desc);


-- ============================================================
-- ٧) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('data_quality_analysis', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $seed$;


-- ============================================================
-- ٨) أمان مستوى الصف
-- ============================================================

do $rls$
declare t text;
begin
  foreach t in array array[
    'data_quality_runs', 'data_quality_issues', 'data_quality_duplicates',
    'data_quality_changeset', 'data_quality_rules', 'data_quality_versions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $rls$;


-- ============================================================
-- ٩) touch updated_at
-- ============================================================

drop trigger if exists on_dq_runs_touch on public.data_quality_runs;
create trigger on_dq_runs_touch before update on public.data_quality_runs
  for each row execute procedure public.touch_updated_at();
