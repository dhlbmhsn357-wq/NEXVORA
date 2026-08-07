-- Rollback لـ 0098 — يحذف الجداول والدوال إذا أُنشئت.
DROP TABLE IF EXISTS public.information_classification_marks CASCADE;
DROP TABLE IF EXISTS public.problem_validation_items CASCADE;
DROP TABLE IF EXISTS public.market_research_items CASCADE;
DROP FUNCTION IF EXISTS public.market_research_touch_updated_at() CASCADE;
