-- ============================================================================
-- 0102 — Product Evaluation Guide (P9)
-- ============================================================================
-- الغرض: توثيق سيناريوهات تقييم المنتج (Deliverable مستقلّ عن Engineering QA).
-- كل سيناريو = خطوات مرتّبة + نتيجة متوقّعة + severity. Runs بتسجّل النتيجة الفعلية.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.evaluation_scenarios (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code              text        NULL,
  title             text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  category          text        NOT NULL DEFAULT 'functional',
  severity          text        NOT NULL DEFAULT 'medium',
  preconditions     text        NOT NULL DEFAULT '',
  steps             jsonb       NOT NULL DEFAULT '[]'::jsonb,     -- [{order, action}]
  expected_result   text        NOT NULL DEFAULT '',
  linked_story_id   uuid        NULL REFERENCES public.user_stories(id) ON DELETE SET NULL,
  linked_flow_id    uuid        NULL REFERENCES public.user_flows(id) ON DELETE SET NULL,
  tags              text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT eval_category_valid CHECK (category IN (
    'functional','usability','performance','security','accessibility','other'
  )),
  CONSTRAINT eval_severity_valid CHECK (severity IN ('low','medium','high','critical'))
);
CREATE INDEX IF NOT EXISTS idx_eval_scen_project ON public.evaluation_scenarios (project_id);
CREATE INDEX IF NOT EXISTS idx_eval_scen_category ON public.evaluation_scenarios (project_id, category);

-- Runs: كل تشغيل لسيناريو (يمكن تكراره على نسخ Prototype مختلفة)
CREATE TABLE IF NOT EXISTS public.evaluation_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scenario_id       uuid        NOT NULL REFERENCES public.evaluation_scenarios(id) ON DELETE CASCADE,
  result            text        NOT NULL,
  actual_result     text        NOT NULL DEFAULT '',
  environment       text        NOT NULL DEFAULT '',
  run_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  run_at            timestamptz NOT NULL DEFAULT now(),
  notes             text        NOT NULL DEFAULT '',
  CONSTRAINT eval_run_result_valid CHECK (result IN ('pass','fail','blocked','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_eval_runs_scen ON public.evaluation_runs (scenario_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_runs_project ON public.evaluation_runs (project_id, run_at DESC);

-- Trigger
CREATE OR REPLACE FUNCTION public.eval_touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eval_scen_updated_at ON public.evaluation_scenarios;
CREATE TRIGGER trg_eval_scen_updated_at BEFORE UPDATE ON public.evaluation_scenarios
FOR EACH ROW EXECUTE FUNCTION public.eval_touch_updated_at();

-- RLS
ALTER TABLE public.evaluation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_runs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eval_scen_select ON public.evaluation_scenarios;
CREATE POLICY eval_scen_select ON public.evaluation_scenarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS eval_runs_select ON public.evaluation_runs;
CREATE POLICY eval_runs_select ON public.evaluation_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);
