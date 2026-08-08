-- Rollback 0107 — operational additions
DROP TABLE IF EXISTS public.handoff_deliveries CASCADE;
DROP TABLE IF EXISTS public.handoff_questions CASCADE;
DROP TABLE IF EXISTS public.project_stage_assignments CASCADE;
DROP TABLE IF EXISTS public.product_decisions_register CASCADE;

-- Restore evidence_links.source_type CHECK to 0101 baseline
ALTER TABLE public.evidence_links DROP CONSTRAINT IF EXISTS ev_source_type_valid;
ALTER TABLE public.evidence_links DROP CONSTRAINT IF EXISTS el_source_type_valid;
ALTER TABLE public.evidence_links ADD CONSTRAINT ev_source_type_valid CHECK (
  source_type IN ('requirement','user_story','acceptance_criterion')
);
