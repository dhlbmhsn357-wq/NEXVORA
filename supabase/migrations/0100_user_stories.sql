-- ============================================================================
-- 0100 — User Stories + Acceptance Criteria (Structured)
-- ============================================================================
-- الغرض: تحويل الـ Requirements المعرّفة في P6 لـ User Stories منظّمة
-- بصيغة "As a X, I want Y, so that Z"، مع Acceptance Criteria بصيغة
-- Gherkin (Given/When/Then). أساس جودة الـ PRD في P8+.
--
-- كل الجداول جديدة. Backwards-compat.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) User Stories
-- ---------------------------------------------------------------------------
-- الحقول الثلاثة الأساسية (as_a / i_want / so_that) مفصولة عمدًا بدل
-- string واحد عشان AI/التقارير تقدر تحلّل كل جزء بمفرده.
--
-- status: draft → in_review → approved → in_dev → done → archived
-- الـ archived للتاريخ (لا نحذف قصص اعتُمدت ثم أُلغيت — بس نأرشفها).

CREATE TABLE IF NOT EXISTS public.user_stories (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code                  text        NULL,           -- US-001 (اختياري)
  title                 text        NOT NULL,
  as_a                  text        NOT NULL DEFAULT '',
  i_want                text        NOT NULL DEFAULT '',
  so_that               text        NOT NULL DEFAULT '',
  narrative_extra       text        NOT NULL DEFAULT '',
  status                text        NOT NULL DEFAULT 'draft',
  story_points          int         NULL,           -- Fibonacci (1/2/3/5/8/13)
  business_value        int         NOT NULL DEFAULT 50,  -- 0..100
  risk_level            text        NOT NULL DEFAULT 'medium',
  linked_persona_id     uuid        NULL REFERENCES public.product_personas(id) ON DELETE SET NULL,
  linked_flow_id        uuid        NULL REFERENCES public.user_flows(id) ON DELETE SET NULL,
  linked_requirement_id uuid        NULL REFERENCES public.product_requirements(id) ON DELETE SET NULL,
  tags                  text[]      NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT story_status_valid CHECK (status IN (
    'draft','in_review','approved','in_dev','done','archived'
  )),
  CONSTRAINT story_business_value_range CHECK (business_value BETWEEN 0 AND 100),
  CONSTRAINT story_risk_valid CHECK (risk_level IN ('low','medium','high')),
  CONSTRAINT story_points_positive CHECK (story_points IS NULL OR story_points >= 0)
);

COMMENT ON TABLE public.user_stories IS
  'قصص المستخدم المهيكلة (as_a / i_want / so_that) + linkage لـ persona/flow/requirement.';

CREATE INDEX IF NOT EXISTS idx_stories_project     ON public.user_stories (project_id);
CREATE INDEX IF NOT EXISTS idx_stories_status      ON public.user_stories (project_id, status);
CREATE INDEX IF NOT EXISTS idx_stories_persona     ON public.user_stories (linked_persona_id);
CREATE INDEX IF NOT EXISTS idx_stories_flow        ON public.user_stories (linked_flow_id);
CREATE INDEX IF NOT EXISTS idx_stories_requirement ON public.user_stories (linked_requirement_id);

-- ---------------------------------------------------------------------------
-- 2) Acceptance Criteria (Gherkin: Given/When/Then)
-- ---------------------------------------------------------------------------
-- كل قصة عندها عدد أدني 0 وأقصى غير محدود من الـ AC. الترتيب مهم للعرض.
-- الحقول الثلاثة (given/when/then) مفصولة عشان الـ AI validator يقدر
-- يفحص كل جزء لوحده. and_conditions مصفوفة نصوص إضافية (Given/And).

CREATE TABLE IF NOT EXISTS public.acceptance_criteria (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_story_id     uuid        NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  order_index       int         NOT NULL DEFAULT 1,
  title             text        NOT NULL DEFAULT '',
  given_clause      text        NOT NULL DEFAULT '',
  when_clause       text        NOT NULL DEFAULT '',
  then_clause       text        NOT NULL DEFAULT '',
  and_conditions    text[]      NOT NULL DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'draft',
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT ac_status_valid CHECK (status IN ('draft','approved','verified','failed')),
  CONSTRAINT ac_order_positive CHECK (order_index >= 1)
);

COMMENT ON TABLE public.acceptance_criteria IS
  'معايير القبول بصيغة Gherkin (Given/When/Then) لكل User Story.';

CREATE INDEX IF NOT EXISTS idx_ac_story    ON public.acceptance_criteria (user_story_id, order_index);
CREATE INDEX IF NOT EXISTS idx_ac_project  ON public.acceptance_criteria (project_id);
CREATE INDEX IF NOT EXISTS idx_ac_status   ON public.acceptance_criteria (project_id, status);

-- ---------------------------------------------------------------------------
-- 3) Triggers لتحديث updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_stories_touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stories_updated_at ON public.user_stories;
CREATE TRIGGER trg_stories_updated_at
BEFORE UPDATE ON public.user_stories
FOR EACH ROW EXECUTE FUNCTION public.user_stories_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ac_updated_at ON public.acceptance_criteria;
CREATE TRIGGER trg_ac_updated_at
BEFORE UPDATE ON public.acceptance_criteria
FOR EACH ROW EXECUTE FUNCTION public.user_stories_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_stories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acceptance_criteria  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stories_select ON public.user_stories;
CREATE POLICY stories_select ON public.user_stories
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS ac_select ON public.acceptance_criteria;
CREATE POLICY ac_select ON public.acceptance_criteria
  FOR SELECT USING (auth.uid() IS NOT NULL);
