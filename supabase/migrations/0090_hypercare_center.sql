-- ============================================================
-- 0090 — مركز Hypercare والمراقبة الذكية والتحسين المستمر (Enterprise
-- Hypercare, Intelligent Monitoring & Continuous Optimization) — المرحلة ٨
--
-- فلسفة: *Migration Success Does NOT End At Go Live — The System Must
-- Continue Learning.* بعد الإطلاق تراقب VELORA المشروع لحظيًّا، تكتشف
-- المشكلات، تتعلّم منها، وتُحسّن كل مشروع مستقبلي. المرحلة الختامية لحزمة
-- **VELORA Enterprise Migration Intelligence Suite (EMIS)**.
--
-- **بناء فوق الموجود:** يبدأ من شهادة الإطلاق (0089)، ويعيد استخدام إشارات
-- الصحة والطابور. الدروس/الأنماط تُرقّى للذاكرة المؤسسية (0082) بعد اعتماد
-- المدير. لا يعدّل أي موديول.
--
-- **آمن على البيانات:** جداول Hypercare جديدة فقط، خاضعة للتدقيق ولا تُعدَّل
-- رجعيًّا. التراجع في 0090_hypercare_center_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) فترات Hypercare — واحدة لكل شهادة إطلاق
-- ============================================================

create table if not exists public.hypercare_periods (
  id            uuid primary key default gen_random_uuid(),
  verification_id uuid references public.go_live_verifications(id) on delete set null,
  certificate_id uuid references public.go_live_certificates(id) on delete set null,
  project_id    uuid references public.projects(id) on delete cascade,
  source_id     uuid references public.migration_sources(id) on delete set null,

  status        text not null default 'active' check (status in ('active','ending','closed')),
  duration_days integer not null default 30,
  baseline_query_ms integer not null default 150,

  overall_health_score integer not null default 0 check (overall_health_score between 0 and 100),
  health_breakdown jsonb not null default '{}'::jsonb,
  total_incidents integer not null default 0,
  resolved_incidents integer not null default 0,
  optimizations_applied integer not null default 0,
  knowledge_added integer not null default 0,

  closure_report jsonb not null default '{}'::jsonb,
  satisfaction_score integer not null default 0 check (satisfaction_score between 0 and 100),
  promoted_to_org_memory boolean not null default false,

  created_by    uuid references auth.users(id) on delete set null,
  started_at    timestamptz not null default now(),
  ends_at       timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_hc_period_project on public.hypercare_periods (project_id, created_at desc);
create index if not exists idx_hc_period_status on public.hypercare_periods (status, created_at desc);


-- ============================================================
-- ٢) لقطات المراقبة (Monitoring Snapshots) — نبضة لكل تشغيل
-- ============================================================

create table if not exists public.hypercare_snapshots (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.hypercare_periods(id) on delete cascade,
  health_score  integer not null default 0,
  health_breakdown jsonb not null default '{}'::jsonb,
  tech_signals  jsonb not null default '{}'::jsonb,
  business_metrics jsonb not null default '[]'::jsonb,
  anomalies_count integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_hc_snap_period on public.hypercare_snapshots (period_id, created_at desc);


-- ============================================================
-- ٣) الحوادث (Incidents) — تلقائية أو يدوية
-- ============================================================

create table if not exists public.hypercare_incidents (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.hypercare_periods(id) on delete cascade,
  title         text not null,
  severity      text not null default 'medium' check (severity in ('critical','high','medium','low')),
  status        text not null default 'open' check (status in ('open','investigating','resolved','closed')),
  impact        text not null default '',
  affected_modules text[] not null default '{}',
  suggested_solution text not null default '',
  root_cause    text,
  resolution    text,
  confidence    integer not null default 0 check (confidence between 0 and 100),
  detected_by   text not null default 'rule' check (detected_by in ('ai','rule','manual')),
  dedupe_key    text,
  reported_by   uuid references auth.users(id) on delete set null,
  resolved_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists idx_hc_inc_period on public.hypercare_incidents (period_id, status, severity);


-- ============================================================
-- ٤) توصيات التحسين (Optimizations)
-- ============================================================

create table if not exists public.hypercare_optimizations (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.hypercare_periods(id) on delete cascade,
  category      text not null,
  title         text not null,
  detail        text not null default '',
  priority      text not null default 'medium' check (priority in ('critical','high','medium','low')),
  expected_gain text not null default '',
  status        text not null default 'proposed' check (status in ('proposed','approved','applied','dismissed')),
  before        jsonb not null default '{}'::jsonb,
  after         jsonb not null default '{}'::jsonb,
  performance_gain text,
  version       integer not null default 1,
  decided_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_hc_opt_period on public.hypercare_optimizations (period_id, status);


-- ============================================================
-- ٥) اقتراحات المعرفة (Knowledge Suggestions) — حاجز مراجعة المدير
-- ============================================================

create table if not exists public.hypercare_knowledge_suggestions (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.hypercare_periods(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  kind          text not null default 'lesson' check (kind in ('lesson','pattern','business_rule')),
  title         text not null,
  content       text not null default '',
  confidence    integer not null default 0 check (confidence between 0 and 100),
  source_incident_id uuid references public.hypercare_incidents(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  promoted_candidate_id uuid,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_hc_know_period on public.hypercare_knowledge_suggestions (period_id, status);


-- ============================================================
-- ٦) ملاحظات المستخدمين (User Feedback)
-- ============================================================

create table if not exists public.hypercare_feedback (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.hypercare_periods(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  kind          text not null default 'problem' check (kind in ('problem','suggestion','bug','improvement','question')),
  title         text not null,
  detail        text,
  status        text not null default 'open' check (status in ('open','reviewed','closed')),
  submitted_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_hc_fb_period on public.hypercare_feedback (period_id, status);


-- ============================================================
-- ٧) صفّ نموذج الذكاء الاصطناعي (اختياري — رشيق لو غاب)
-- ============================================================

do $hc_seed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    insert into public.ai_task_model_config (task_type, provider, model)
    values ('migration_hypercare_analysis', 'gemini', 'gemini-2.0-flash')
    on conflict (task_type) do nothing;
  end if;
end $hc_seed$;


-- ============================================================
-- ٨) أمان مستوى الصف
-- ============================================================

do $hc_rls$
declare t text;
begin
  foreach t in array array[
    'hypercare_periods', 'hypercare_snapshots', 'hypercare_incidents',
    'hypercare_optimizations', 'hypercare_knowledge_suggestions', 'hypercare_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format('create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format('create policy %I_service_all on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $hc_rls$;


-- ============================================================
-- ٩) touch updated_at
-- ============================================================

drop trigger if exists on_hypercare_periods_touch on public.hypercare_periods;
create trigger on_hypercare_periods_touch before update on public.hypercare_periods
  for each row execute procedure public.touch_updated_at();
