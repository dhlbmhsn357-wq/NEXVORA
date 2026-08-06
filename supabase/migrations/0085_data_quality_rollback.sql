-- ============================================================
-- تراجع 0085 — منصّة جودة البيانات
--
-- ⚠️ اقرأ قبل التشغيل: يحذف كل تشغيلات الجودة ومشاكلها وتصحيحاتها
-- وقواعدها. لا يمكن التراجع عن هذا الحذف.
-- ============================================================

drop trigger if exists on_dq_runs_touch on public.data_quality_runs;

drop table if exists public.data_quality_versions cascade;
drop table if exists public.data_quality_rules cascade;
drop table if exists public.data_quality_changeset cascade;
drop table if exists public.data_quality_duplicates cascade;
drop table if exists public.data_quality_issues cascade;
drop table if exists public.data_quality_runs cascade;
