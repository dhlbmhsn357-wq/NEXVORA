-- ============================================================
-- تراجع 0090 — مركز Hypercare (المرحلة ٨)
-- يحذف جداول Hypercare فقط. جداول المراحل ١-٧ لا تُمَسّ.
-- ============================================================

drop trigger if exists on_hypercare_periods_touch on public.hypercare_periods;

drop table if exists public.hypercare_feedback cascade;
drop table if exists public.hypercare_knowledge_suggestions cascade;
drop table if exists public.hypercare_optimizations cascade;
drop table if exists public.hypercare_incidents cascade;
drop table if exists public.hypercare_snapshots cascade;
drop table if exists public.hypercare_periods cascade;

do $hc_unseed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    delete from public.ai_task_model_config where task_type = 'migration_hypercare_analysis';
  end if;
end $hc_unseed$;
