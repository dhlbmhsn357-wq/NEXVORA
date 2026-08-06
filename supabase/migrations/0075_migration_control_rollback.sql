-- ============================================================
-- تراجع 0075 — التحكّم في الترحيل
--
-- **اقرأ قبل التشغيل:** هذا يحذف سجل من غيّر أي علم ومتى، وكل بيانات
-- مقارنة القديم بالجديد. لو الهدف إيقاف الترحيل لا حذف بنيته، فالأمر
-- الصحيح هو إطفاء الأعلام لا هذا الملف:
--
--   update public.migration_flags set state = 'off', rollout_percent = 0;
--
-- أو أسرع منه بلا قاعدة بيانات: MIGRATION_KILL_SWITCH=on في البيئة.
--
-- إطفاء الأعلام يعيد المنصة للمسار القديم فورًا ويُبقي القياس والسجل —
-- وهما بالضبط ما تحتاجه لتشخيص سبب الرجوع.
-- ============================================================

drop function if exists public.migration_comparison_summary(timestamptz);
drop function if exists public.prune_migration_comparisons(integer);

drop table if exists public.migration_comparisons;
drop table if exists public.migration_flag_events;
drop table if exists public.migration_flags;
