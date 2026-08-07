-- Rollback for 0096_workflow_v2
DROP TRIGGER IF EXISTS trg_workflow_stages_v2_updated_at ON public.workflow_stages_v2;
DROP FUNCTION IF EXISTS public.workflow_stages_v2_touch_updated_at();
DROP TABLE IF EXISTS public.workflow_stage_checklists;
DROP TABLE IF EXISTS public.workflow_stages_v2;
-- ملاحظة: عمود projects.workflow_version يبقى (backward-compatible، مش هيكسر شيء).
-- لو محتاج تشيله يدويًا:
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS workflow_version;
