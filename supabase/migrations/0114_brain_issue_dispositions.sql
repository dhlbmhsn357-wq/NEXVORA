-- 0114_brain_issue_dispositions.sql
-- Phase 5 escape hatch — تأجيل/تجاهل لمشاكل تحقّق Brain Review الحرجة/العالية.
-- Additive only. تقرير التحقّق (brain_review_validation_reports) بيتولّد صف
-- جديد كل "إعادة تحقّق"، فالقرار لازم يتخزّن على project_brain_documents
-- (زي missing_info_dispositions/assumption_dispositions) عشان يعيش عبر
-- إعادة التشغيل. المفتاح ثابت = type::category::description (أول 120 حرف).

ALTER TABLE public.project_brain_documents
  ADD COLUMN IF NOT EXISTS issue_dispositions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.project_brain_documents.issue_dispositions IS
  'تأجيل/تجاهل توصيات التحقّق الحرجة/العالية — مفتاح كل عنصر ثابت عبر إعادة التشغيل (type::category::description). لا تُحسم كـ approved حتى pending يفضل blocking.';
