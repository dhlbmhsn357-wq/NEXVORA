-- ============================================================
-- تراجع 0084 — محرّك الـMapping والتحويل الدلالي
--
-- ⚠️ اقرأ قبل التشغيل: يحذف كل المخطّطات ومطابقاتها وإصداراتها وقوالبها.
-- لا يمكن التراجع عن هذا الحذف.
-- ============================================================

drop trigger if exists on_migration_blueprints_touch on public.migration_blueprints;

drop table if exists public.migration_mapping_templates cascade;
drop table if exists public.migration_blueprint_versions cascade;
drop table if exists public.migration_mapping_conflicts cascade;
drop table if exists public.migration_mapping_rules cascade;
drop table if exists public.migration_relationship_mappings cascade;
drop table if exists public.migration_field_mappings cascade;
drop table if exists public.migration_entity_mappings cascade;
drop table if exists public.migration_blueprints cascade;
