-- ============================================================
-- 0074 — منصة معالجة الذكاء الاصطناعي (AI Processing Platform)
--
-- المرحلة الثالثة: بنية تشغيل فقط. مفيش أي منطق أعمال هنا، ومفيش
-- تعديل على أي جدول قائم غير **إضافة أعمدة** لـ ai_requests_log.
--
-- الترحيل ده **آمن على البيانات**: جداول جديدة + أعمدة إضافية بقيم
-- افتراضية. التراجع في 0074_ai_platform_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) توسعة سجل نداءات الذكاء الاصطناعي
--
-- الجدول موجود من الترحيل 0003 وبيسجّل المزوّد والنموذج والزمن — لكن
-- **بلا أي عمود للرموز أو التكلفة**، والكود بيمرّر `token_usage: null`
-- و`cost: null`. النتيجة: مستحيل حاليًا معرفة تكلفة أي مشروع.
--
-- ده كان أول ما كشفه تدقيق المرحلة الأولى، وده مكانه الصحيح.
-- ============================================================

alter table public.ai_requests_log
  add column if not exists input_tokens      integer,
  add column if not exists output_tokens     integer,
  add column if not exists total_tokens      integer,
  add column if not exists cost_usd          numeric(12,6),
  add column if not exists cached            boolean not null default false,
  add column if not exists job_id            uuid references public.jobs(id) on delete set null,
  add column if not exists trace_id          text,
  add column if not exists prompt_version    integer,
  add column if not exists worker_version    text,
  add column if not exists sanitized_fields  integer not null default 0;

create index if not exists idx_ai_requests_log_cost
  on public.ai_requests_log (created_at desc)
  where cost_usd is not null;
create index if not exists idx_ai_requests_log_job
  on public.ai_requests_log (job_id) where job_id is not null;
create index if not exists idx_ai_requests_log_trace
  on public.ai_requests_log (trace_id) where trace_id is not null;


-- ============================================================
-- ٢) جدول التسعير
--
-- بتواريخ سريان عن قصد: تغيّر السعر ما يجوزش يعيد كتابة تاريخ التكلفة.
-- تقرير التكلفة عن الشهر الماضي لازم يفضل صحيحًا بأسعار الشهر الماضي.
-- ============================================================

create table if not exists public.ai_pricing (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  model             text not null,
  input_per_1k_usd  numeric(12,8) not null,
  output_per_1k_usd numeric(12,8) not null,
  effective_from    timestamptz not null default now(),
  effective_to      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),

  constraint ai_pricing_positive check (input_per_1k_usd >= 0 and output_per_1k_usd >= 0),
  constraint ai_pricing_window check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_ai_pricing_lookup
  on public.ai_pricing (provider, model, effective_from desc);


-- ============================================================
-- ٣) قوالب البرومبت وإصداراتها
--
-- كل برومبت له: نسخة، ومن أنشأها، ومتى، والقالب، والمتغيّرات، وبصمة،
-- وتاريخ، وإمكانية رجوع.
--
-- **البصمة جزء من الهوية لا حقل وصفي**: تعديل القالب لازم يُبطِل كل
-- النتائج المخزَّنة المبنية عليه، وإلا خدمت الذاكرة إجابات مبنية على
-- تعليمات لم تعد قائمة.
-- ============================================================

create table if not exists public.ai_prompt_templates (
  id              uuid primary key default gen_random_uuid(),
  key             text not null,              -- معرّف مستقر: discovery.analysis
  task_type       text not null,              -- AITaskType المقابل
  description     text,
  active_version  integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ai_prompt_templates_key_unique unique (key)
);

create table if not exists public.ai_prompt_versions (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.ai_prompt_templates(id) on delete cascade,
  version       integer not null,
  template      text not null,                -- النص مع {{المتغيّرات}}
  variables     jsonb not null default '[]'::jsonb,
  content_hash  text not null,                -- sha256 للقالب
  change_note   text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint ai_prompt_versions_unique unique (template_id, version),
  constraint ai_prompt_versions_positive check (version > 0)
);

create index if not exists idx_ai_prompt_versions_template
  on public.ai_prompt_versions (template_id, version desc);
create index if not exists idx_ai_prompt_versions_hash
  on public.ai_prompt_versions (content_hash);


-- ============================================================
-- ٤) مخزن النتائج
--
-- يحفظ المدخل والمخرج والبيانات الوصفية وزمن التنفيذ والمزوّد والرموز
-- والتكلفة والأخطاء وإصدار البرومبت وإصدار العامل.
-- ============================================================

create table if not exists public.ai_results (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references public.jobs(id) on delete set null,
  project_id        uuid references public.projects(id) on delete cascade,
  task_type         text not null,

  input_hash        text not null,            -- بصمة المدخل بعد التطبيع
  input_preview     text,                     -- أول مقطع للعرض فقط
  output            jsonb,
  output_text       text,

  provider          text not null,
  model             text not null,
  prompt_template   text,
  prompt_version    integer,
  worker_version    text,

  input_tokens      integer,
  output_tokens     integer,
  cost_usd          numeric(12,6),
  execution_time_ms integer,

  -- المهام الكبيرة تُقسَّم؛ الأجزاء تشير للنتيجة الأم وتُدمَج.
  parent_result_id  uuid references public.ai_results(id) on delete cascade,
  chunk_index       integer,
  chunk_count       integer,

  success           boolean not null default true,
  error_code        text,
  error_message     text,

  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_results_project
  on public.ai_results (project_id, created_at desc);
create index if not exists idx_ai_results_task
  on public.ai_results (task_type, created_at desc);
create index if not exists idx_ai_results_job
  on public.ai_results (job_id) where job_id is not null;
create index if not exists idx_ai_results_parent
  on public.ai_results (parent_result_id) where parent_result_id is not null;
-- البحث عن نتيجة مطابقة يمرّ من هنا في كل نداء — لازم يفضل سريعًا.
create index if not exists idx_ai_results_lookup
  on public.ai_results (task_type, input_hash, prompt_version)
  where success = true;


-- ============================================================
-- ٥) ذاكرة النتائج
--
-- المفتاح **يحمل إصدار البرومبت والنموذج**، لا المدخل وحده. ذاكرة
-- تُخدَم بعد تغيّر التعليمات أسوأ من عدم وجود ذاكرة: الخطأ صامت ولا
-- يُعزى إلى سببه.
-- ============================================================

create table if not exists public.ai_cache (
  cache_key      text primary key,            -- sha256(task|model|promptVersion|inputHash)
  task_type      text not null,
  result_id      uuid references public.ai_results(id) on delete cascade,
  output         jsonb,
  output_text    text,
  input_tokens   integer,
  output_tokens  integer,
  hit_count      integer not null default 0,
  saved_usd      numeric(12,6) not null default 0,   -- التوفير التراكمي
  created_at     timestamptz not null default now(),
  last_hit_at    timestamptz,
  expires_at     timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_ai_cache_expires on public.ai_cache (expires_at);
create index if not exists idx_ai_cache_task on public.ai_cache (task_type, created_at desc);


-- ============================================================
-- ٦) حالة المزوّدين (قاطع الدائرة)
--
-- الحالة مشتركة بين كل نسخ العامل — وإلا اكتشف كل عامل التعطّل بمفرده
-- وأهدر محاولاته الخاصة قبل أن يعرف.
-- ============================================================

create table if not exists public.ai_provider_health (
  provider           text primary key,
  state              text not null default 'closed',   -- closed · open · half_open
  consecutive_errors integer not null default 0,
  opened_at          timestamptz,
  next_probe_at      timestamptz,
  last_error         text,
  last_success_at    timestamptz,
  updated_at         timestamptz not null default now(),

  constraint ai_provider_health_state check (state in ('closed', 'open', 'half_open'))
);


-- ============================================================
-- ٧) بذور التسعير — Gemini
--
-- الأرقام من صفحة تسعير Google (الفئة المدفوعة القياسية)، محوّلة من
-- «لكل مليون رمز» إلى «لكل ألف» بالقسمة على ألف.
--
-- **درس مسجَّل:** التقدير الأول هنا كان ٠.٠٠٠٠٧٥ / ٠.٠٠٠٣٠ — أي أقل
-- من الحقيقة بعشرين وثلاثين ضعفًا. تقرير تكلفة مبني عليه كان سيقلّل
-- الرقم الحقيقي نحو خمسة وعشرين ضعفًا. راجع الأسعار من المصدر عند كل
-- تغيير في النموذج المستخدم، ولا تترك تقديرًا يحمل لافتة «مؤكَّد».
-- ============================================================

insert into public.ai_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, notes)
values
  ('gemini', 'gemini-3.5-flash',   0.0015,  0.009, 'من صفحة تسعير Google — الفئة المدفوعة القياسية'),
  ('gemini', 'text-embedding-004', 0.00002, 0,     'الأشعة: مدخل فقط — تقدير، راجعه عند الاستخدام الكثيف')
on conflict do nothing;


-- ============================================================
-- ٨) أمان مستوى الصف
-- ============================================================

alter table public.ai_pricing            enable row level security;
alter table public.ai_prompt_templates   enable row level security;
alter table public.ai_prompt_versions    enable row level security;
alter table public.ai_results            enable row level security;
alter table public.ai_cache              enable row level security;
alter table public.ai_provider_health    enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'ai_pricing', 'ai_prompt_templates', 'ai_prompt_versions',
    'ai_results', 'ai_cache', 'ai_provider_health'
  ] loop
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
end $$;


-- ============================================================
-- ٩) دالة: ملخّص التكلفة
--
-- استعلام واحد بدل عدة نداءات من التطبيق — نفس درس نمط N+1.
-- ============================================================

create or replace function public.ai_cost_summary(
  p_since timestamptz default (now() - interval '30 days')
)
returns table (
  project_id    uuid,
  task_type     text,
  provider      text,
  requests      bigint,
  cached_hits   bigint,
  input_tokens  bigint,
  output_tokens bigint,
  total_cost    numeric,
  avg_latency   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select l.project_id,
         l.task_type,
         l.provider,
         count(*)::bigint,
         count(*) filter (where l.cached)::bigint,
         coalesce(sum(l.input_tokens), 0)::bigint,
         coalesce(sum(l.output_tokens), 0)::bigint,
         coalesce(sum(l.cost_usd), 0)::numeric,
         avg(l.latency_ms)::numeric
    from public.ai_requests_log l
   where l.created_at >= p_since
   group by l.project_id, l.task_type, l.provider;
$$;

grant execute on function public.ai_cost_summary(timestamptz) to service_role, authenticated;
