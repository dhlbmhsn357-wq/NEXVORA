-- ============================================================
-- 0073 — بنية الطوابير الأساسية (Core Queue Infrastructure)
--
-- المرحلة الثانية: بنية تحتية فقط. مفيش أي منطق أعمال هنا، ومفيش
-- تعديل على أي جدول قائم — كل حاجة إضافية بالكامل.
--
-- التصميم مرجعه وثيقة التصميم المعماري (الأقسام ٦ و٧ و٨).
--
-- الترحيل ده **آمن على البيانات**: بينشئ جداول جديدة بس، ومابيمسّش
-- ولا صف موجود. التراجع في 0073_job_queue_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) الأنواع المعدودة (Enums)
-- ============================================================

-- إحدى عشرة حالة زي ما طلبت المواصفة بالظبط.
--
-- `waiting` منفصلة عن `queued` عن قصد: `queued` معناها جاهزة والعامل
-- ممكن ياخدها دلوقتي، و`waiting` معناها مستنية شرط خارجي (قفل مورد
-- محجوز، أو موعد مجدول لسه ماجاش). الخلط بينهم بيخفي سبب التأخير.
--
-- `timeout` منفصلة عن `failed` عشان نقدر نفرّق في المقاييس بين "فشل
-- بخطأ" و"مامخلّصش في وقته" — العلاج مختلف تمامًا.
do $$ begin
  create type public.job_status as enum (
    'pending',
    'queued',
    'waiting',
    'running',
    'retrying',
    'paused',
    'canceled',
    'completed',
    'failed',
    'dead_letter',
    'timeout'
  );
exception when duplicate_object then null; end $$;

-- الأولوية كنوع معدود مرتّب: الترتيب في enum هو ترتيب التنفيذ نفسه،
-- فـ order by priority بيشتغل صح من غير جدول ترجمة.
do $$ begin
  create type public.job_priority as enum (
    'critical',
    'high',
    'normal',
    'low',
    'background'
  );
exception when duplicate_object then null; end $$;

-- تصنيف الفشل بيحدّد هل نعيد المحاولة أصلًا. إعادة محاولة خطأ دائم
-- عشر مرات هدر خالص، وده اللي بتعمله معظم النظم الساذجة.
do $$ begin
  create type public.job_failure_class as enum (
    'transient',   -- 429، مهلة، 503 — يستحق إعادة المحاولة
    'permanent',   -- مدخل غير صالح، صلاحية مرفوضة — لا يستحق
    'unknown'      -- غير مصنّف — محاولتان ثم رسائل ميتة
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.worker_status as enum (
    'starting',
    'idle',
    'busy',
    'draining',
    'stopped',
    'unhealthy'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_log_level as enum (
    'execution',
    'warning',
    'error',
    'performance'
  );
exception when duplicate_object then null; end $$;


-- ============================================================
-- ٢) العمال (Workers)
--
-- التسجيل والنبضة. ده اللي بيخلّي "العامل وقع" حالة مكتشَفة بدل
-- مهام عالقة صامتة — وهو بالظبط العطل اللي أسقط المنصة في ٢٧ يوليو.
-- ============================================================

create table if not exists public.queue_workers (
  id              uuid primary key default gen_random_uuid(),
  worker_key      text not null unique,      -- معرّف ثابت للنسخة (اسم الخدمة + رقم النسخة)
  worker_type     text not null,             -- ai · browser · document · media · embedding · bot
  handled_types   text[] not null default '{}',
  status          public.worker_status not null default 'starting',
  concurrency     smallint not null default 1,
  active_jobs     smallint not null default 0,
  hostname        text,
  version         text,
  -- مقاييس الصحة — تُحدَّث مع كل نبضة
  cpu_percent     numeric(5,2),
  memory_mb       integer,
  jobs_processed  bigint not null default 0,
  jobs_failed     bigint not null default 0,
  last_error      text,
  started_at      timestamptz not null default now(),
  heartbeat_at    timestamptz not null default now(),
  stopped_at      timestamptz,
  metadata        jsonb not null default '{}'::jsonb,

  constraint queue_workers_concurrency_positive check (concurrency > 0),
  constraint queue_workers_active_within_limit check (active_jobs >= 0 and active_jobs <= concurrency)
);

create index if not exists idx_queue_workers_heartbeat
  on public.queue_workers (heartbeat_at desc);
create index if not exists idx_queue_workers_status
  on public.queue_workers (status, worker_type);


-- ============================================================
-- ٣) المهام (Jobs) — الجدول المركزي
-- ============================================================

create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  type             text not null,
  status           public.job_status not null default 'pending',
  priority         public.job_priority not null default 'normal',

  -- الملكية والصلاحيات — تُفحص عند الإدراج وعند القراءة
  project_id       uuid references public.projects(id) on delete cascade,
  created_by       uuid references public.profiles(id) on delete set null,

  payload          jsonb not null default '{}'::jsonb,
  result           jsonb,

  -- التقدّم والاستئناف: `progress` رقم للعرض، و`checkpoint` موضع
  -- التوقّف الفعلي. الفصل مقصود — الواجهة تعرض الأول، والعامل يستأنف
  -- من التاني، ولا يجوز أن يعتمد الاستئناف على رقم مئوي.
  progress         smallint not null default 0,
  progress_message text,
  checkpoint       jsonb,

  attempts         smallint not null default 0,
  max_attempts     smallint not null default 3,

  worker_id        text,                      -- queue_workers.worker_key للعامل الماسك
  lock_key         text,                      -- قفل المورد (brain:{project} مثلًا)

  -- منع التكرار: مفتاح من العميل (Idempotency) + بصمة محسوبة (إسقاط تكرار)
  idempotency_key  text,
  dedupe_hash      text,

  trace_id         text,                      -- يربط كل السجلات عبر الحدود

  error_message    text,
  error_stack      text,
  error_class      public.job_failure_class,

  -- القياس
  execution_time_ms integer,
  queue_time_ms     integer,
  cpu_usage_ms      integer,
  memory_peak_mb    integer,
  estimated_cost_usd numeric(10,6),

  metadata         jsonb not null default '{}'::jsonb,

  -- التواريخ
  created_at       timestamptz not null default now(),
  available_at     timestamptz not null default now(),  -- بعد التراجع الأُسّي
  scheduled_for    timestamptz,                          -- التأجيل المتعمَّد
  started_at       timestamptz,
  heartbeat_at     timestamptz,
  finished_at      timestamptz,
  canceled_at      timestamptz,
  retry_at         timestamptz,

  constraint jobs_progress_range check (progress >= 0 and progress <= 100),
  constraint jobs_attempts_within_max check (attempts >= 0 and attempts <= max_attempts + 1),
  constraint jobs_max_attempts_positive check (max_attempts > 0)
);

-- ------------------------------------------------------------
-- الفهارس
-- ------------------------------------------------------------

-- الفهرس الأهم في الجدول كله: ده اللي بيخدم استعلام المطالبة
-- (claim) اللي بيتنفّذ آلاف المرات. جزئي عن قصد — المهام المنتهية
-- تمثّل الأغلبية الساحقة بعد شهور، وإدخالها في الفهرس هيبطّئ كل
-- مطالبة بلا فايدة.
create index if not exists idx_jobs_claim
  on public.jobs (priority, available_at, created_at)
  where status = 'queued';

create index if not exists idx_jobs_type_status
  on public.jobs (type, status);
create index if not exists idx_jobs_project
  on public.jobs (project_id, created_at desc);
create index if not exists idx_jobs_created_by
  on public.jobs (created_by, created_at desc);
create index if not exists idx_jobs_status_created
  on public.jobs (status, created_at desc);
create index if not exists idx_jobs_trace
  on public.jobs (trace_id) where trace_id is not null;

-- كشف المهام العالقة — نفس نمط الفهرس الجزئي.
create index if not exists idx_jobs_heartbeat
  on public.jobs (heartbeat_at)
  where status = 'running';

-- المهام المجدولة اللي لسه ماجاش وقتها.
create index if not exists idx_jobs_scheduled
  on public.jobs (scheduled_for)
  where status = 'waiting' and scheduled_for is not null;

-- Idempotency: نفس المفتاح لنفس المستخدم = نفس المهمة. فريد جزئيًا
-- عشان الصفوف اللي بلا مفتاح ماتتعارضش مع بعضها.
create unique index if not exists idx_jobs_idempotency
  on public.jobs (idempotency_key)
  where idempotency_key is not null;

-- إسقاط التكرار: البصمة فريدة **فقط بين المهام الحيّة**. لما المهمة
-- تخلص، نفس المدخل يبقى مسموح تاني — وده الفرق الجوهري بين إسقاط
-- التكرار (نافذة قصيرة) وIdempotency (دائم).
create unique index if not exists idx_jobs_dedupe_alive
  on public.jobs (dedupe_hash)
  where dedupe_hash is not null
    and status in ('pending', 'queued', 'waiting', 'running', 'retrying', 'paused');


-- ============================================================
-- ٤) أحداث المهام (سجل الانتقالات — غير قابل للتعديل)
-- ============================================================

create table if not exists public.job_events (
  id           bigserial primary key,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  event_type   text not null,               -- JobCreated · JobStarted · JobProgress · …
  from_status  public.job_status,
  to_status    public.job_status,
  reason       text,
  actor_id     uuid references public.profiles(id) on delete set null,
  worker_id    text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_events_job
  on public.job_events (job_id, created_at);
create index if not exists idx_job_events_type_time
  on public.job_events (event_type, created_at desc);


-- ============================================================
-- ٥) سجلات المهام (تنفيذ · تحذير · خطأ · أداء)
-- ============================================================

create table if not exists public.job_logs (
  id         bigserial primary key,
  job_id     uuid not null references public.jobs(id) on delete cascade,
  level      public.job_log_level not null default 'execution',
  message    text not null,
  context    jsonb not null default '{}'::jsonb,
  attempt    smallint,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_logs_job
  on public.job_logs (job_id, created_at);
-- استعلام "وريني أخطاء آخر ساعة" لازم يفضل سريع مهما كبر الجدول.
create index if not exists idx_job_logs_errors
  on public.job_logs (created_at desc)
  where level = 'error';


-- ============================================================
-- ٦) طابور الرسائل الميتة
--
-- المهمة اللي استنفدت محاولاتها **ما تتحذفش أبدًا**. الطابور الصامت
-- الممتلئ بالفشل أسوأ حالة ممكنة: نظام يبدو سليمًا وهو مابينجزش حاجة.
-- ============================================================

create table if not exists public.job_dead_letters (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  job_type       text not null,
  project_id     uuid references public.projects(id) on delete set null,
  final_error    text,
  error_class    public.job_failure_class,
  attempts       smallint not null,
  payload        jsonb not null default '{}'::jsonb,
  moved_at       timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  resolution     text,                       -- requeued · discarded · fixed
  requeued_job_id uuid references public.jobs(id) on delete set null
);

create unique index if not exists idx_job_dead_letters_job
  on public.job_dead_letters (job_id);
create index if not exists idx_job_dead_letters_unreviewed
  on public.job_dead_letters (moved_at desc)
  where reviewed_at is null;


-- ============================================================
-- ٧) الأقفال الموزّعة
--
-- `SKIP LOCKED` بيمنع سحب نفس المهمة مرتين. لكنه **مابيمنعش** مهمتين
-- مختلفتين من الكتابة في نفس المورد معًا — زي إعادتَي توليد لنفس
-- Brain. القفل هنا بالمورد لا بالمهمة.
-- ============================================================

create table if not exists public.job_locks (
  lock_key    text primary key,
  job_id      uuid references public.jobs(id) on delete cascade,
  worker_id   text,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  metadata    jsonb not null default '{}'::jsonb
);

-- الأقفال المنتهية تُنظَّف دوريًا — القفل اليتيم بعد سقوط عامل
-- بيحجب المورد للأبد لو مافيش انتهاء صلاحية.
create index if not exists idx_job_locks_expires
  on public.job_locks (expires_at);


-- ============================================================
-- ٨) مفاتيح Idempotency الدائمة
--
-- منفصلة عن `jobs.idempotency_key` عن قصد: ده بيحفظ **الرد** كمان،
-- فإعادة الطلب بعد ما المهمة اتمسحت لسه بترجّع نفس النتيجة.
-- ============================================================

create table if not exists public.job_idempotency_keys (
  key          text primary key,
  user_id      uuid references public.profiles(id) on delete cascade,
  request_hash text not null,               -- نفس المفتاح بمدخل مختلف = خطأ صريح
  job_id       uuid references public.jobs(id) on delete set null,
  response     jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_job_idempotency_expires
  on public.job_idempotency_keys (expires_at);


-- ============================================================
-- ٩) مقاييس النظام
-- ============================================================

create table if not exists public.queue_metrics (
  id           bigserial primary key,
  metric_name  text not null,
  value        numeric not null,
  labels       jsonb not null default '{}'::jsonb,
  recorded_at  timestamptz not null default now()
);

create index if not exists idx_queue_metrics_name_time
  on public.queue_metrics (metric_name, recorded_at desc);


-- ============================================================
-- ١٠) مُشغِّل: تحديث تلقائي لأزمنة القياس
--
-- زمن الانتظار في الطابور وزمن التنفيذ يُحسبان في القاعدة لا في
-- التطبيق — عشان يبقوا متسقين مهما كان مصدر الكتابة.
-- ============================================================

create or replace function public.touch_job_timing()
returns trigger
language plpgsql
as $$
begin
  if new.started_at is not null and old.started_at is null then
    new.queue_time_ms := greatest(
      0,
      (extract(epoch from (new.started_at - new.created_at)) * 1000)::integer
    );
  end if;

  if new.finished_at is not null and old.finished_at is null and new.started_at is not null then
    new.execution_time_ms := greatest(
      0,
      (extract(epoch from (new.finished_at - new.started_at)) * 1000)::integer
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jobs_timing on public.jobs;
create trigger trg_jobs_timing
  before update on public.jobs
  for each row execute function public.touch_job_timing();


-- ============================================================
-- ١١) دوال المطالبة والتعافي
--
-- لازم تكون دوال في قاعدة البيانات مش في التطبيق: عميل Supabase
-- بيتكلم عبر PostgREST ومابيقدرش ينفّذ `for update skip locked`.
-- و`SKIP LOCKED` هو بالظبط اللي بيخلّي عشرين عاملًا يسحبوا من نفس
-- الجدول من غير تنازع ومن غير معالجة مزدوجة — القراءة ثم التحديث من
-- التطبيق تسمح لعاملين بأخذ نفس الصف.
-- ============================================================

create or replace function public.claim_next_job(
  p_worker_id  text,
  p_types      text[],
  p_lock_ttl_seconds integer default 300
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  select * into v_job
  from public.jobs j
  where j.status = 'queued'
    and j.available_at <= now()
    and j.type = any(p_types)
    -- القفل بالمورد: لو فيه مهمة تانية ماسكة نفس المفتاح، نتخطّى دي
    -- ونجيب اللي بعدها بدل ما نستنى.
    and (
      j.lock_key is null
      or not exists (
        select 1 from public.job_locks l
        where l.lock_key = j.lock_key and l.expires_at > now()
      )
    )
  order by j.priority asc, j.available_at asc, j.created_at asc
  for update skip locked
  limit 1;

  if v_job.id is null then
    return;
  end if;

  -- حجز قفل المورد إن وُجد (نفس المعاملة، فلا سباق)
  if v_job.lock_key is not null then
    insert into public.job_locks (lock_key, job_id, worker_id, expires_at)
    values (
      v_job.lock_key, v_job.id, p_worker_id,
      now() + make_interval(secs => p_lock_ttl_seconds)
    )
    on conflict (lock_key) do update
      set job_id = excluded.job_id,
          worker_id = excluded.worker_id,
          acquired_at = now(),
          expires_at = excluded.expires_at
      where public.job_locks.expires_at <= now();
  end if;

  update public.jobs
     set status = 'running',
         worker_id = p_worker_id,
         attempts = attempts + 1,
         started_at = coalesce(started_at, now()),
         heartbeat_at = now()
   where id = v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

-- ------------------------------------------------------------
-- تعافي المهام العالقة
--
-- ده الحارس ضد العطل اللي أسقط المنصة في ٢٧ يوليو: مهمة اتعلّقت في
-- "جاري التنفيذ" بلا كاشف ولا مهلة. من غير الدالة دي، أي عامل يسقط
-- بيسيب مهامه معلّقة للأبد بصمت.
-- ------------------------------------------------------------
create or replace function public.recover_stuck_jobs(
  p_heartbeat_timeout_seconds integer default 180
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with stuck as (
    update public.jobs
       set status = case
                      when attempts >= max_attempts then 'failed'::public.job_status
                      else 'queued'::public.job_status
                    end,
           worker_id = null,
           error_message = coalesce(
             error_message,
             'العامل توقّف عن النبض — استُعيدت المهمة تلقائيًا.'
           ),
           error_class = 'transient'::public.job_failure_class,
           available_at = now()
     where status = 'running'
       and heartbeat_at is not null
       and heartbeat_at < now() - make_interval(secs => p_heartbeat_timeout_seconds)
    returning id
  )
  select count(*) into v_count from stuck;

  -- تنظيف الأقفال اليتيمة: القفل بعد سقوط عامل بيحجب المورد للأبد
  -- لو مافيش انتهاء صلاحية يُنظَّف.
  delete from public.job_locks where expires_at <= now();

  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- ترقية المهام المؤجَّلة اللي حان وقتها
-- ------------------------------------------------------------
create or replace function public.promote_scheduled_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with promoted as (
    update public.jobs
       set status = 'queued', available_at = now()
     where status = 'waiting'
       and scheduled_for is not null
       and scheduled_for <= now()
    returning id
  )
  select count(*) into v_count from promoted;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- إحصاءات الطابور — استعلام واحد بدل ستة من التطبيق
-- ------------------------------------------------------------
create or replace function public.queue_stats()
returns table (
  status public.job_status,
  count bigint,
  avg_execution_ms numeric,
  avg_queue_ms numeric,
  oldest_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select j.status,
         count(*)::bigint,
         avg(j.execution_time_ms)::numeric,
         avg(j.queue_time_ms)::numeric,
         min(j.created_at)
    from public.jobs j
   where j.created_at > now() - interval '7 days'
      or j.status = any(array['pending','queued','waiting','running','retrying','paused']::public.job_status[])
   group by j.status;
$$;

revoke all on function public.claim_next_job(text, text[], integer) from public, anon, authenticated;
revoke all on function public.recover_stuck_jobs(integer) from public, anon, authenticated;
revoke all on function public.promote_scheduled_jobs() from public, anon, authenticated;
grant execute on function public.claim_next_job(text, text[], integer) to service_role;
grant execute on function public.recover_stuck_jobs(integer) to service_role;
grant execute on function public.promote_scheduled_jobs() to service_role;
grant execute on function public.queue_stats() to service_role, authenticated;


-- ============================================================
-- ١٢) أمان مستوى الصف
--
-- نفس نمط المشروع: قراءة لأي مستخدم مسجّل دخول، وكل الكتابات عبر
-- عميل الخدمة. فحص الصلاحيات الحقيقي في طبقة الإجراءات (RBAC)،
-- وRLS طبقة أمان أخيرة تمنع غير المسجّلين.
-- ============================================================

alter table public.jobs                 enable row level security;
alter table public.job_events           enable row level security;
alter table public.job_logs             enable row level security;
alter table public.job_dead_letters     enable row level security;
alter table public.job_locks            enable row level security;
alter table public.job_idempotency_keys enable row level security;
alter table public.queue_workers        enable row level security;
alter table public.queue_metrics        enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'jobs', 'job_events', 'job_logs', 'job_dead_letters',
    'job_locks', 'job_idempotency_keys', 'queue_workers', 'queue_metrics'
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
-- ١٣) البث اللحظي — بديل الاستقصاء
--
-- ده الجزء اللي بيلغي الحاجة للاستقصاء من المتصفح تمامًا: الواجهة
-- بتشترك في تغييرات صفّ المهمة بتاعها وبتستقبل التقدّم فورًا.
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;
