-- ============================================================
-- تراجع 0083 — منصّة اكتشاف الترحيل
--
-- ⚠️ اقرأ قبل التشغيل: يحذف كل مصادر الترحيل ولقطاتها وتحليلاتها. لا
-- يمكن التراجع عن هذا الحذف. صفّ الوزن المزروع في جداول مشتركة (إن وُجد)
-- لا يُحذَف هنا.
-- ============================================================

drop trigger if exists on_migration_snapshots_touch on public.migration_snapshots;
drop trigger if exists on_migration_sources_touch on public.migration_sources;

drop table if exists public.migration_reports cascade;
drop table if exists public.migration_relationships cascade;
drop table if exists public.migration_entities cascade;
drop table if exists public.migration_snapshots cascade;
drop table if exists public.migration_sources cascade;
