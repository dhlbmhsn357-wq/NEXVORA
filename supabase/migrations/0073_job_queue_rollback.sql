-- ============================================================
-- تراجع الترحيل 0073 — بنية الطوابير
--
-- **لا يُنفَّذ إلا عند الحاجة الصريحة للتراجع.**
--
-- آمن تمامًا على البيانات القائمة: الترحيل 0073 أضاف جداول جديدة
-- فقط ولم يمسّ أي جدول موجود، فالتراجع يحذف ما أضافه لا أكثر.
--
-- الترتيب مقصود: الأبناء قبل الآباء، ثم الدوال، ثم الأنواع — وإلا
-- فشل الحذف على قيود المفاتيح الأجنبية.
-- ============================================================

-- ١) إزالة الجدول من البث اللحظي قبل حذفه
do $$ begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime drop table public.jobs;
  end if;
end $$;

-- ٢) الدوال والمُشغِّل
drop function if exists public.claim_next_job(text, text[], integer);
drop function if exists public.recover_stuck_jobs(integer);
drop function if exists public.promote_scheduled_jobs();
drop function if exists public.queue_stats();
drop trigger if exists trg_jobs_timing on public.jobs;
drop function if exists public.touch_job_timing();

-- ٣) الجداول — الأبناء أولًا
drop table if exists public.queue_metrics          cascade;
drop table if exists public.job_idempotency_keys   cascade;
drop table if exists public.job_locks              cascade;
drop table if exists public.job_dead_letters       cascade;
drop table if exists public.job_logs               cascade;
drop table if exists public.job_events             cascade;
drop table if exists public.jobs                   cascade;
drop table if exists public.queue_workers          cascade;

-- ٤) الأنواع المعدودة — بعد كل الجداول اللي بتستخدمها
drop type if exists public.job_log_level;
drop type if exists public.worker_status;
drop type if exists public.job_failure_class;
drop type if exists public.job_priority;
drop type if exists public.job_status;
