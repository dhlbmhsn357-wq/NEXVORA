-- ============================================================
-- تراجع 0088 — محرّك الترحيل الحقيقي (المرحلة ٦)
-- يحذف جداول التحكّم/التدقيق فقط. جداول المراحل ١-٥ لا تُمَسّ.
-- ============================================================

drop trigger if exists on_migration_executions_touch on public.migration_executions;

drop table if exists public.migration_rollback_packages cascade;
drop table if exists public.migration_preflight_checks cascade;
drop table if exists public.migration_execution_events cascade;
drop table if exists public.migration_execution_tasks cascade;
drop table if exists public.migration_backups cascade;
drop table if exists public.migration_executions cascade;

do $pm_unseed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    delete from public.ai_task_model_config where task_type = 'migration_recovery';
  end if;
end $pm_unseed$;
