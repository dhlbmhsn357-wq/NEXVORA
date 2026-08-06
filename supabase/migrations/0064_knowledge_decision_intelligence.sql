-- 0064_knowledge_decision_intelligence.sql
-- المرحلة السادسة: Enterprise Knowledge & Decision Intelligence.
-- تُغلق الفجوات الحقيقية فوق البنية الموجودة (المعرفة التنظيمية +
-- Knowledge Graph لكل مشروع + Smart Recommendations v2 + Domain Intelligence):
--   1) مكتبة الوحدات القابلة لإعادة الاستخدام (Business Module Library)
--      اللي بتكبر مع كل مشروع.
--   2) اكتشاف الوحدات لكل مشروع (present/missing sub-features).
--   3) تقرير التحقّق المعماري قبل الـ PRD.
-- إضافات فقط — لا يوجد أي تعديل هدّام.

-- 1) مكتبة الوحدات القابلة لإعادة الاستخدام (org-wide، بتكبر مع الوقت)
create table if not exists public.business_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,            -- معرّف قانوني (accounting/inventory/auth...)
  name text not null,
  primary_domain text,                        -- أكثر مجال بيظهر فيه
  features jsonb not null default '[]'::jsonb,           -- الميزات/الوظائف الفرعية
  business_rules jsonb not null default '[]'::jsonb,
  required_permissions jsonb not null default '[]'::jsonb,
  required_reports jsonb not null default '[]'::jsonb,
  recommended_architecture text,
  common_mistakes jsonb not null default '[]'::jsonb,    -- تتراكم من QA/الحوادث/المراجعات
  qa_findings jsonb not null default '[]'::jsonb,
  source_project_ids uuid[] not null default '{}',
  occurrence_count int not null default 1,
  status text not null default 'candidate' check (status in ('candidate','validated','approved','deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_business_modules_domain on public.business_modules (primary_domain);

-- 2) اكتشاف الوحدات لكل مشروع
create table if not exists public.project_module_detections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  module_key text not null,
  present boolean not null default false,
  detected_features jsonb not null default '[]'::jsonb,
  missing_features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, module_key)
);
create index if not exists idx_module_detections_project on public.project_module_detections (project_id);

-- 3) تقرير التحقّق المعماري قبل الـ PRD (صف واحد لكل مشروع، upsert)
create table if not exists public.architecture_validation_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade unique,
  status text not null default 'ready' check (status in ('generating','ready','failed')),
  domain text,
  missing_modules jsonb not null default '[]'::jsonb,       -- [{module_key,name,reason}]
  missing_features jsonb not null default '[]'::jsonb,      -- [{module_key,feature}]
  gaps jsonb not null default '{}'::jsonb,                  -- {reports:[],permissions:[],roles:[],integrations:[],workflows:[],dashboards:[],notifications:[],business_rules:[],audit_logs:[],security:[],apis:[],db_tables:[]}
  reused_insights jsonb not null default '[]'::jsonb,       -- [{project_id,name,modules,mistakes,qa}]
  readiness_score int not null default 100 check (readiness_score between 0 and 100),
  ai_summary text,
  last_error text,
  generated_from_brain_version int,
  requested_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);

-- RLS
do $$
declare t text;
begin
  foreach t in array array['business_modules','project_module_detections','architecture_validation_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='public' and tablename='%1$s' and policyname='internal_all_%1$s') then
          create policy internal_all_%1$s on public.%1$s
            for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
        end if;
      end $inner$;
    $p$, t);
  end loop;
end $$;

-- AI: التحقّق المعماري (اكتشاف النواقص قبل الـ PRD)
insert into public.ai_task_model_config (task_type, provider, model)
values ('architecture_validation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;
