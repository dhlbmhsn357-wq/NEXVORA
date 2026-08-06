-- ============================================================
-- PM Operating System — 0054 Production Intelligence & Organizational
-- AI (Phase 6 — closing the continuous-learning loop)
--
-- إضافي بحت، idempotent. مفيش أي جدول/عمود قديم اتشال أو اتغيّر
-- سلوكه. الفئات نص + CHECK زي كل جدول تصنيفي تاني في المشروع، عمدًا
-- مش Lookup Table منفصل.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) monitoring_incidents — حقول تحليل أغنى (evidence الموجود بالفعل
-- بيتملى دلوقتي، الأعمدة الجديدة فقط للحقول اللي معندهاش مكان).
-- ============================================================
alter table public.monitoring_incidents
  add column if not exists affected_components text[] not null default '{}',
  add column if not exists risk_level text check (risk_level in ('critical', 'high', 'medium', 'low')),
  add column if not exists workaround text not null default '',
  add column if not exists permanent_solution text not null default '',
  add column if not exists estimated_fix_time_hours numeric,
  add column if not exists priority text check (priority in ('critical', 'high', 'medium', 'low')),
  add column if not exists affected_users_estimate text not null default '',
  add column if not exists source text not null default 'monitoring_check' check (source in ('monitoring_check', 'support_ticket')),
  add column if not exists support_request_id uuid references public.support_requests(id) on delete set null;

-- ============================================================
-- 2) infra_service_status — إشارات بنية تحتية حقيقية لو متاحة (Supabase
-- عبر نفس الـ Service Role Client بدون Token جديد)، أو "غير مُهيَّأ"
-- بوضوح لو الخدمة (Railway/Vercel) محتاجة Token مش موجود بعد — مفيش
-- أي رقم ملفّق أبدًا.
-- ============================================================
create table if not exists public.infra_service_status (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  service text not null check (service in ('railway', 'vercel', 'supabase')),
  configured boolean not null default false,
  status text not null default 'unknown' check (status in ('unknown', 'not_configured', 'healthy', 'degraded', 'down')),
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
create unique index if not exists idx_infra_service_status_project_service on public.infra_service_status(project_id, service);

-- ============================================================
-- 3) monitoring_fix_prompts — تقسيم الحادثة إلى Prompts متعددة حسب
-- المحور التقني، منفصل تمامًا عن fix_prompt_generation المستخدمة في
-- حلقة إصلاح Engineering QA (execution_tasks) — صفر تعارض.
-- ============================================================
create table if not exists public.monitoring_fix_prompts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.monitoring_incidents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  area text not null check (area in ('database', 'frontend', 'api', 'worker', 'tests', 'deployment', 'other')),
  order_index integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'used', 'superseded')),
  created_at timestamptz not null default now()
);
create index if not exists idx_monitoring_fix_prompts_incident on public.monitoring_fix_prompts(incident_id, order_index);

-- ============================================================
-- 4) monitoring_review_reports — تقرير التحقّق بعد الإصلاح: حكم AI لكل
-- حادثة + درجة إجمالية محسوبة بالكود (مش AI) من توزيع الأحكام.
-- ============================================================
create table if not exists public.monitoring_review_reports (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.monitoring_checks(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  verdicts jsonb not null default '[]'::jsonb,
  overall_fix_score integer check (overall_fix_score between 0 and 100),
  requested_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);
create index if not exists idx_monitoring_review_reports_project on public.monitoring_review_reports(project_id, generated_at desc);

-- ============================================================
-- 5) support_requests — تشخيصات حقيقية مُلتقطة من المتصفح وقت إنشاء
-- التذكرة (مش بيانات ملفّقة) + تشخيص AI صريح منفصل عن التصنيف.
-- ============================================================
alter table public.support_requests
  add column if not exists browser_info jsonb not null default '{}'::jsonb,
  add column if not exists environment_info jsonb not null default '{}'::jsonb,
  add column if not exists recent_client_errors jsonb not null default '[]'::jsonb,
  add column if not exists ai_diagnosis jsonb not null default '{}'::jsonb;

-- ============================================================
-- 6) organizational_knowledge — تصفية حسب مجال المشروع (يعيد استخدام
-- projects.domain الموجود من Phase 3، صفر تصنيف جديد) + وزن مُتعلّم
-- منفصل عن ثقة الـ AI الأصلية (confidence_score يفضل زي ما هو دايمًا،
-- learned_weight بس بيتحرّك مع كل قبول/رفض توصية).
-- ============================================================
alter table public.organizational_knowledge
  add column if not exists domain text check (domain in (
    'erp', 'crm', 'lms', 'healthcare', 'legal', 'construction', 'hospital',
    'ecommerce', 'restaurant', 'factory', 'clinic', 'school', 'warehouse',
    'accounting', 'generic'
  )),
  add column if not exists learned_weight integer not null default 50 check (learned_weight between 0 and 100);

update public.organizational_knowledge set learned_weight = confidence_score where learned_weight = 50;

create index if not exists idx_organizational_knowledge_domain on public.organizational_knowledge(domain);

-- ============================================================
-- 6.5) get_database_size_stats — إحصاءات حقيقية عن حجم قاعدة البيانات
-- (بدون أي Token خارجي، عبر نفس Service Role Client الموجود بالفعل).
-- ============================================================
create or replace function public.get_database_size_stats()
returns table (
  database_size_bytes bigint,
  table_count integer,
  total_row_estimate bigint
)
language sql
security definer
set search_path = public
as $$
  select
    pg_database_size(current_database()) as database_size_bytes,
    (select count(*)::integer from pg_stat_user_tables) as table_count,
    (select coalesce(sum(n_live_tup), 0)::bigint from pg_stat_user_tables) as total_row_estimate;
$$;

-- ============================================================
-- 7) مهام الذكاء الاصطناعي الجديدة.
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('production_fix_prompt_generation', 'gemini', 'gemini-3.5-flash'),
  ('production_monitoring_review_verdict', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- 8) RLS للجداول الجديدة.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['infra_service_status', 'monitoring_fix_prompts', 'monitoring_review_reports']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "internal_read_%s" on public.%I', t, t);
    execute format('create policy "internal_read_%s" on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists "internal_write_%s" on public.%I', t, t);
    execute format('create policy "internal_write_%s" on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
  end loop;
end $$;

-- ============================================================
-- انتهى 0054
-- ============================================================
