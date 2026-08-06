-- ============================================================
-- 0091 — تراجع جسر الحمل (Load Bridge Rollback)
-- يحذف جداول الجسر فقط. لا يمسّ أي جدول سابق.
-- ============================================================

drop trigger if exists on_migration_load_runs_touch on public.migration_load_runs;
drop trigger if exists on_migration_load_targets_touch on public.migration_load_targets;

drop table if exists public.migration_load_runs cascade;
drop table if exists public.migration_load_targets cascade;
drop table if exists public.migration_loaded_datasets cascade;
