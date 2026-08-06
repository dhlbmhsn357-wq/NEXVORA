-- ============================================================
-- تراجع 0089 — مركز التحقّق وقبول الأعمال وشهادة الإطلاق (المرحلة ٧)
-- يحذف جداول التحقّق/الاعتماد فقط. جداول المراحل ١-٦ لا تُمَسّ.
-- ============================================================

drop trigger if exists on_go_live_verifications_touch on public.go_live_verifications;

drop table if exists public.go_live_certificates cascade;
drop table if exists public.go_live_issues cascade;
drop table if exists public.go_live_uat cascade;
drop table if exists public.go_live_branches cascade;
drop table if exists public.go_live_departments cascade;
drop table if exists public.go_live_data_checks cascade;
drop table if exists public.go_live_verifications cascade;

do $gl_unseed$
begin
  if to_regclass('public.ai_task_model_config') is not null then
    delete from public.ai_task_model_config where task_type = 'migration_golive_verification';
  end if;
end $gl_unseed$;
