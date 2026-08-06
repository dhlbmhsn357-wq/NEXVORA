-- ============================================================
-- تراجع 0086 — محرّك التحويل
--
-- ⚠️ اقرأ قبل التشغيل: يحذف كل خطوط التحويل وقواعدها وإصداراتها ومكتبتها.
-- لا يمكن التراجع عن هذا الحذف.
-- ============================================================

drop trigger if exists on_tr_pipelines_touch on public.transformation_pipelines;

drop table if exists public.transformation_rule_library cascade;
drop table if exists public.transformation_rule_versions cascade;
drop table if exists public.transformation_business_rules cascade;
drop table if exists public.transformation_rules cascade;
drop table if exists public.transformation_pipelines cascade;
