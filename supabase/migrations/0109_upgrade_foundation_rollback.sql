-- Rollback 0109 — Upgrade Foundation
-- Reverses additive changes. Does NOT restore backfilled codes.

-- Indexes
DROP INDEX IF EXISTS public.idx_pr_derived_scenario;
DROP INDEX IF EXISTS public.idx_us_derived_scenario;
DROP INDEX IF EXISTS public.idx_ac_derived_scenario;
DROP INDEX IF EXISTS public.idx_projects_mode;

-- Evidence origin columns
ALTER TABLE public.market_research_items DROP COLUMN IF EXISTS origin;
ALTER TABLE public.problem_validation_items DROP COLUMN IF EXISTS origin;

-- Status CHECKs — restore pre-0109 sets
ALTER TABLE public.product_requirements DROP CONSTRAINT IF EXISTS pr_status_valid;
ALTER TABLE public.product_requirements
  ADD CONSTRAINT pr_status_valid
    CHECK (status IN ('draft','approved','in_progress','done','deferred'));

ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS us_status_valid;
ALTER TABLE public.user_stories
  ADD CONSTRAINT us_status_valid
    CHECK (status IN ('draft','in_review','approved','in_dev','done','archived'));

ALTER TABLE public.acceptance_criteria DROP CONSTRAINT IF EXISTS ac_status_valid;
ALTER TABLE public.acceptance_criteria
  ADD CONSTRAINT ac_status_valid
    CHECK (status IN ('draft','approved','verified','failed'));

-- evaluation_scenarios.status
ALTER TABLE public.evaluation_scenarios DROP COLUMN IF EXISTS status;

-- derived_from_scenario_id columns
ALTER TABLE public.product_requirements DROP COLUMN IF EXISTS derived_from_scenario_id;
ALTER TABLE public.user_stories DROP COLUMN IF EXISTS derived_from_scenario_id;
ALTER TABLE public.acceptance_criteria DROP COLUMN IF EXISTS derived_from_scenario_id;

-- UNIQUE constraints on code
ALTER TABLE public.product_requirements DROP CONSTRAINT IF EXISTS product_requirements_project_code_uniq;
ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_project_code_uniq;
ALTER TABLE public.acceptance_criteria DROP CONSTRAINT IF EXISTS acceptance_criteria_project_code_uniq;
ALTER TABLE public.evaluation_scenarios DROP CONSTRAINT IF EXISTS evaluation_scenarios_project_code_uniq;

-- code column on acceptance_criteria (added by 0109; safe to drop)
ALTER TABLE public.acceptance_criteria DROP COLUMN IF EXISTS code;

-- projects.mode
ALTER TABLE public.projects DROP COLUMN IF EXISTS mode;
