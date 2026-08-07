-- ============================================================================
-- 0099 — Product Definition (Personas + User Flows + Requirements + MoSCoW)
-- ============================================================================
-- الغرض: توفير الأساس الرسمي لتعريف المنتج بعد اكتمال البحث السوقي
-- والتحقق من المشكلة (P5). ثلاث ركائز:
--   (أ) Personas       — شرائح المستخدمين المستهدفة (Job/Goals/Pains)
--   (ب) User Flows     — سيناريوهات الاستخدام الأساسية (خطوات مرتّبة)
--   (ج) Requirements   — متطلبات وظيفية/غير وظيفية + MoSCoW priority
--
-- كل الجداول جديدة. Backwards-compat: IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Personas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_personas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  role              text        NOT NULL DEFAULT '',
  segment           text        NOT NULL DEFAULT '',
  jobs_to_be_done   text        NOT NULL DEFAULT '',
  goals             text        NOT NULL DEFAULT '',
  pains             text        NOT NULL DEFAULT '',
  channels          text[]      NOT NULL DEFAULT '{}',
  tech_savviness    int         NOT NULL DEFAULT 50,
  notes             text        NOT NULL DEFAULT '',
  is_primary        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT persona_tech_savviness_range CHECK (tech_savviness BETWEEN 0 AND 100)
);

COMMENT ON TABLE public.product_personas IS
  'شرائح المستخدمين المستهدفة — كل persona عندها Jobs/Goals/Pains + قنوات + مستوى تقني.';

CREATE INDEX IF NOT EXISTS idx_personas_project ON public.product_personas (project_id);
CREATE INDEX IF NOT EXISTS idx_personas_primary ON public.product_personas (project_id, is_primary) WHERE is_primary;

-- ---------------------------------------------------------------------------
-- 2) User Flows
-- ---------------------------------------------------------------------------
-- steps: jsonb array من {order, action, expected_result, notes}
-- flow_type: primary (رئيسي، اليومي) / secondary (ثانوي) / edge (حالات نادرة)

CREATE TABLE IF NOT EXISTS public.user_flows (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  persona_id        uuid        NULL REFERENCES public.product_personas(id) ON DELETE SET NULL,
  name              text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  flow_type         text        NOT NULL DEFAULT 'primary',
  trigger_event     text        NOT NULL DEFAULT '',
  success_outcome   text        NOT NULL DEFAULT '',
  steps             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT flow_type_valid CHECK (flow_type IN ('primary','secondary','edge'))
);

COMMENT ON TABLE public.user_flows IS
  'سيناريوهات الاستخدام (User Flows) — خطوات مرتّبة تبدأ من trigger وتنتهي بـ outcome.';

CREATE INDEX IF NOT EXISTS idx_flows_project ON public.user_flows (project_id);
CREATE INDEX IF NOT EXISTS idx_flows_persona ON public.user_flows (persona_id);
CREATE INDEX IF NOT EXISTS idx_flows_type    ON public.user_flows (project_id, flow_type);

-- ---------------------------------------------------------------------------
-- 3) Product Requirements + MoSCoW
-- ---------------------------------------------------------------------------
-- requirement_type: functional / non_functional
-- priority: must / should / could / wont  (MoSCoW — Must-have / Should-have / Could-have / Won't-have)
-- status: draft / approved / in_progress / done / deferred

CREATE TABLE IF NOT EXISTS public.product_requirements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code              text        NULL,   -- كود اختياري (REQ-001 مثلاً)
  title             text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  requirement_type  text        NOT NULL DEFAULT 'functional',
  priority          text        NOT NULL DEFAULT 'should',
  status            text        NOT NULL DEFAULT 'draft',
  rationale         text        NOT NULL DEFAULT '',
  acceptance_hint   text        NOT NULL DEFAULT '',
  effort_estimate   text        NOT NULL DEFAULT '',  -- S/M/L/XL أو ساعات
  linked_persona_id uuid        NULL REFERENCES public.product_personas(id) ON DELETE SET NULL,
  linked_flow_id    uuid        NULL REFERENCES public.user_flows(id) ON DELETE SET NULL,
  tags              text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT req_type_valid CHECK (requirement_type IN ('functional','non_functional')),
  CONSTRAINT req_priority_moscow CHECK (priority IN ('must','should','could','wont')),
  CONSTRAINT req_status_valid CHECK (status IN ('draft','approved','in_progress','done','deferred'))
);

COMMENT ON TABLE public.product_requirements IS
  'متطلبات المنتج — Functional/Non-Functional مع MoSCoW priority + linking لـ persona/flow.';

CREATE INDEX IF NOT EXISTS idx_reqs_project    ON public.product_requirements (project_id);
CREATE INDEX IF NOT EXISTS idx_reqs_priority   ON public.product_requirements (project_id, priority);
CREATE INDEX IF NOT EXISTS idx_reqs_status     ON public.product_requirements (project_id, status);
CREATE INDEX IF NOT EXISTS idx_reqs_persona    ON public.product_requirements (linked_persona_id);
CREATE INDEX IF NOT EXISTS idx_reqs_flow       ON public.product_requirements (linked_flow_id);

-- ---------------------------------------------------------------------------
-- 4) Triggers لتحديث updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_definition_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personas_updated_at ON public.product_personas;
CREATE TRIGGER trg_personas_updated_at
BEFORE UPDATE ON public.product_personas
FOR EACH ROW EXECUTE FUNCTION public.product_definition_touch_updated_at();

DROP TRIGGER IF EXISTS trg_flows_updated_at ON public.user_flows;
CREATE TRIGGER trg_flows_updated_at
BEFORE UPDATE ON public.user_flows
FOR EACH ROW EXECUTE FUNCTION public.product_definition_touch_updated_at();

DROP TRIGGER IF EXISTS trg_reqs_updated_at ON public.product_requirements;
CREATE TRIGGER trg_reqs_updated_at
BEFORE UPDATE ON public.product_requirements
FOR EACH ROW EXECUTE FUNCTION public.product_definition_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_personas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_flows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_requirements   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personas_select ON public.product_personas;
CREATE POLICY personas_select ON public.product_personas
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS flows_select ON public.user_flows;
CREATE POLICY flows_select ON public.user_flows
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS reqs_select ON public.product_requirements;
CREATE POLICY reqs_select ON public.product_requirements
  FOR SELECT USING (auth.uid() IS NOT NULL);
