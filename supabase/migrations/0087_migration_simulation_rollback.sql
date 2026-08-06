-- ============================================================
-- تراجع 0087 — مركز محاكاة الترحيل (المرحلة ٥)
-- يحذف جداول المحاكاة فقط. جداول المراحل ١-٤ لا تُمَسّ.
-- ============================================================

drop trigger if exists on_migration_simulations_touch on public.migration_simulations;

drop table if exists public.migration_simulation_reports cascade;
drop table if exists public.migration_simulation_issues cascade;
drop table if exists public.migration_simulation_steps cascade;
drop table if exists public.migration_simulations cascade;

do $sim_unseed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    delete from public.ai_task_model_config where task_type = 'migration_simulation_validation';
  end if;
end $sim_unseed$;
