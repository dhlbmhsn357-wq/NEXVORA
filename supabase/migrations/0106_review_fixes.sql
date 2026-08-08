-- ============================================================================
-- 0106 — Review Fixes (Workflow gating, Handoff, Evaluation, Info Class, ...)
-- ============================================================================
-- تعديلات إضافية فقط (Additive). لا حذف أعمدة أو جداول أو قيم موجودة.
-- كل CHECK constraints المعدّلة توسّع القيم المسموحة (لا تضيّق) عشان تظل
-- بيانات الصفوف الحالية صالحة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIX 1: Default workflow_version للـ projects الجديدة = 'v2'
-- (الصفوف القديمة تبقى 'v1' — لا backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ALTER COLUMN workflow_version SET DEFAULT 'v2';
COMMENT ON COLUMN public.projects.workflow_version IS
  'Workflow UI للمشروع: v1 (25 stage قديمة) أو v2 (7 مراحل NEXVORA). الصفوف القديمة v1، الجديدة v2.';

-- ---------------------------------------------------------------------------
-- FIX 3: توسيع فئات evaluation_scenarios لتشمل قيم Product/UX-focused
-- ---------------------------------------------------------------------------
ALTER TABLE public.evaluation_scenarios DROP CONSTRAINT IF EXISTS eval_category_valid;
ALTER TABLE public.evaluation_scenarios DROP CONSTRAINT IF EXISTS es_category_valid;
ALTER TABLE public.evaluation_scenarios
  ADD CONSTRAINT eval_category_valid CHECK (category IN (
    'functional','usability','performance','security','accessibility','other',
    'empty_states','error_states','mobile_rtl','ux_clarity','user_outcomes'
  ));

-- ---------------------------------------------------------------------------
-- FIX 4: Information Classification — فصل طبيعة المعلومة عن السرّية
-- ---------------------------------------------------------------------------
-- (أ) توسيع classification في information_classification_marks لطبيعة المعلومة
ALTER TABLE public.information_classification_marks DROP CONSTRAINT IF EXISTS ic_classification_valid;
ALTER TABLE public.information_classification_marks
  ADD CONSTRAINT ic_classification_valid CHECK (classification IN (
    'unclassified','legacy','needs_review','verified',
    'fact','inference','assumption','hypothesis','decision'
  ));

-- (ب) إضافة عمود information_class لعناصر البحث السوقي (طبيعة المعلومة على العنصر نفسه)
ALTER TABLE public.market_research_items
  ADD COLUMN IF NOT EXISTS information_class text NOT NULL DEFAULT 'unclassified';
ALTER TABLE public.market_research_items DROP CONSTRAINT IF EXISTS mri_information_class_valid;
ALTER TABLE public.market_research_items
  ADD CONSTRAINT mri_information_class_valid CHECK (information_class IN (
    'unclassified','legacy','needs_review','verified',
    'fact','inference','assumption','hypothesis','decision'
  ));

-- (ج) إضافة عمود confidentiality لعناصر البحث السوقي
ALTER TABLE public.market_research_items
  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'internal';
ALTER TABLE public.market_research_items DROP CONSTRAINT IF EXISTS mri_confidentiality_valid;
ALTER TABLE public.market_research_items
  ADD CONSTRAINT mri_confidentiality_valid CHECK (confidentiality IN (
    'public','internal','confidential'
  ));

-- (د) نفس المعاملة لعناصر Problem Validation
ALTER TABLE public.problem_validation_items
  ADD COLUMN IF NOT EXISTS information_class text NOT NULL DEFAULT 'unclassified';
ALTER TABLE public.problem_validation_items DROP CONSTRAINT IF EXISTS pvi_information_class_valid;
ALTER TABLE public.problem_validation_items
  ADD CONSTRAINT pvi_information_class_valid CHECK (information_class IN (
    'unclassified','legacy','needs_review','verified',
    'fact','inference','assumption','hypothesis','decision'
  ));

ALTER TABLE public.problem_validation_items
  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'internal';
ALTER TABLE public.problem_validation_items DROP CONSTRAINT IF EXISTS pvi_confidentiality_valid;
ALTER TABLE public.problem_validation_items
  ADD CONSTRAINT pvi_confidentiality_valid CHECK (confidentiality IN (
    'public','internal','confidential'
  ));

-- ---------------------------------------------------------------------------
-- FIX 7: External Partners — deprecate 'editor' role (still valid in CHECK)
-- ---------------------------------------------------------------------------
ALTER TABLE public.external_partners ALTER COLUMN role SET DEFAULT 'viewer';
COMMENT ON COLUMN public.external_partners.role IS
  'DEPRECATED: only viewer is honored. editor role has no active permissions and is retained for schema backwards compatibility.';
