-- ============================================================================
-- 0106 — Review Fixes ROLLBACK
-- ============================================================================
-- ملاحظة: تخفيف الـ CHECK لا يُعيد أي بيانات (فقط يعيد القيم القديمة المسموحة).
-- الأعمدة المضافة تُحذف بأمان لأنها جديدة على 0106.
-- ============================================================================

-- FIX 1: رجّع default لـ 'v1'
ALTER TABLE public.projects ALTER COLUMN workflow_version SET DEFAULT 'v1';

-- FIX 3: رجّع CHECK evaluation_scenarios للقيم الأصلية
ALTER TABLE public.evaluation_scenarios DROP CONSTRAINT IF EXISTS eval_category_valid;
ALTER TABLE public.evaluation_scenarios
  ADD CONSTRAINT eval_category_valid CHECK (category IN (
    'functional','usability','performance','security','accessibility','other'
  ));

-- FIX 4: رجّع classification للقيم الأصلية + احذف أعمدة الجديدة
ALTER TABLE public.information_classification_marks DROP CONSTRAINT IF EXISTS ic_classification_valid;
ALTER TABLE public.information_classification_marks
  ADD CONSTRAINT ic_classification_valid CHECK (classification IN (
    'unclassified','legacy','needs_review','verified'
  ));

ALTER TABLE public.market_research_items DROP CONSTRAINT IF EXISTS mri_information_class_valid;
ALTER TABLE public.market_research_items DROP CONSTRAINT IF EXISTS mri_confidentiality_valid;
ALTER TABLE public.market_research_items DROP COLUMN IF EXISTS information_class;
ALTER TABLE public.market_research_items DROP COLUMN IF EXISTS confidentiality;

ALTER TABLE public.problem_validation_items DROP CONSTRAINT IF EXISTS pvi_information_class_valid;
ALTER TABLE public.problem_validation_items DROP CONSTRAINT IF EXISTS pvi_confidentiality_valid;
ALTER TABLE public.problem_validation_items DROP COLUMN IF EXISTS information_class;
ALTER TABLE public.problem_validation_items DROP COLUMN IF EXISTS confidentiality;

-- FIX 7: رجّع default الدور لـ viewer (نفس القيمة، لا تغيير فعلي)
ALTER TABLE public.external_partners ALTER COLUMN role SET DEFAULT 'viewer';
