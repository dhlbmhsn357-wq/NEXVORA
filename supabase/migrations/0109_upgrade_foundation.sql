-- ============================================================================
-- 0109 — Upgrade Foundation
-- Project mode, unique codes, derived_from_scenario_id, status extensions
-- Additive only. No DROP. No destructive ALTER. Backwards compat guaranteed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIX 1: project mode (test / real / unclassified)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'unclassified'
    CHECK (mode IN ('unclassified','test','real'));
COMMENT ON COLUMN public.projects.mode IS
  'unclassified (default for legacy) | test (evidence auto-simulated) | real (client project). Change via Owner/Admin only.';

CREATE INDEX IF NOT EXISTS idx_projects_mode ON public.projects(mode);

-- ---------------------------------------------------------------------------
-- FIX 2 (a): add code column to acceptance_criteria
-- ---------------------------------------------------------------------------
ALTER TABLE public.acceptance_criteria
  ADD COLUMN IF NOT EXISTS code text NULL;

-- ---------------------------------------------------------------------------
-- FIX 2 (b): backfill NULL codes for existing rows (deterministic order)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.product_requirements pr
  SET code = 'REQ-' || LPAD(sub.rn::text, 3, '0')
  FROM (
    SELECT id, project_id,
           ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
    FROM public.product_requirements WHERE code IS NULL
  ) sub
  WHERE pr.id = sub.id;

  UPDATE public.user_stories us
  SET code = 'US-' || LPAD(sub.rn::text, 3, '0')
  FROM (
    SELECT id, project_id,
           ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
    FROM public.user_stories WHERE code IS NULL
  ) sub
  WHERE us.id = sub.id;

  UPDATE public.acceptance_criteria ac
  SET code = 'AC-' || LPAD(sub.rn::text, 3, '0')
  FROM (
    SELECT id, project_id,
           ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
    FROM public.acceptance_criteria WHERE code IS NULL
  ) sub
  WHERE ac.id = sub.id;

  UPDATE public.evaluation_scenarios es
  SET code = 'SC-' || LPAD(sub.rn::text, 3, '0')
  FROM (
    SELECT id, project_id,
           ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
    FROM public.evaluation_scenarios WHERE code IS NULL
  ) sub
  WHERE es.id = sub.id;
END $$;

-- ---------------------------------------------------------------------------
-- FIX 2 (c): UNIQUE constraint per project (guarded to allow re-run)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_requirements_project_code_uniq') THEN
    ALTER TABLE public.product_requirements
      ADD CONSTRAINT product_requirements_project_code_uniq UNIQUE (project_id, code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_stories_project_code_uniq') THEN
    ALTER TABLE public.user_stories
      ADD CONSTRAINT user_stories_project_code_uniq UNIQUE (project_id, code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acceptance_criteria_project_code_uniq') THEN
    ALTER TABLE public.acceptance_criteria
      ADD CONSTRAINT acceptance_criteria_project_code_uniq UNIQUE (project_id, code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_scenarios_project_code_uniq') THEN
    ALTER TABLE public.evaluation_scenarios
      ADD CONSTRAINT evaluation_scenarios_project_code_uniq UNIQUE (project_id, code);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- FIX 3: derived_from_scenario_id soft FK on 3 tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_requirements
  ADD COLUMN IF NOT EXISTS derived_from_scenario_id uuid NULL
    REFERENCES public.evaluation_scenarios(id) ON DELETE SET NULL;
ALTER TABLE public.user_stories
  ADD COLUMN IF NOT EXISTS derived_from_scenario_id uuid NULL
    REFERENCES public.evaluation_scenarios(id) ON DELETE SET NULL;
ALTER TABLE public.acceptance_criteria
  ADD COLUMN IF NOT EXISTS derived_from_scenario_id uuid NULL
    REFERENCES public.evaluation_scenarios(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- FIX 11 (a): evaluation_scenarios.status
-- ---------------------------------------------------------------------------
ALTER TABLE public.evaluation_scenarios
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','needs_review'));

-- ---------------------------------------------------------------------------
-- FIX 11 (b): expand status CHECKs to include 'needs_review'
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_requirements DROP CONSTRAINT IF EXISTS pr_status_valid;
ALTER TABLE public.product_requirements DROP CONSTRAINT IF EXISTS product_requirements_status_check;
ALTER TABLE public.product_requirements
  ADD CONSTRAINT pr_status_valid
    CHECK (status IN ('draft','approved','in_progress','done','deferred','needs_review'));

ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS us_status_valid;
ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_status_check;
ALTER TABLE public.user_stories
  ADD CONSTRAINT us_status_valid
    CHECK (status IN ('draft','in_review','approved','in_dev','done','archived','needs_review'));

ALTER TABLE public.acceptance_criteria DROP CONSTRAINT IF EXISTS ac_status_valid;
ALTER TABLE public.acceptance_criteria DROP CONSTRAINT IF EXISTS acceptance_criteria_status_check;
ALTER TABLE public.acceptance_criteria
  ADD CONSTRAINT ac_status_valid
    CHECK (status IN ('draft','approved','verified','failed','needs_review'));

-- ---------------------------------------------------------------------------
-- FIX 10: evidence origin on market_research + problem_validation
-- ---------------------------------------------------------------------------
ALTER TABLE public.market_research_items
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'unverified'
    CHECK (origin IN ('unverified','verified_real','simulated'));
ALTER TABLE public.problem_validation_items
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'unverified'
    CHECK (origin IN ('unverified','verified_real','simulated'));

-- ---------------------------------------------------------------------------
-- Indexes for derived scenario lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pr_derived_scenario ON public.product_requirements(derived_from_scenario_id) WHERE derived_from_scenario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_us_derived_scenario ON public.user_stories(derived_from_scenario_id) WHERE derived_from_scenario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ac_derived_scenario ON public.acceptance_criteria(derived_from_scenario_id) WHERE derived_from_scenario_id IS NOT NULL;
