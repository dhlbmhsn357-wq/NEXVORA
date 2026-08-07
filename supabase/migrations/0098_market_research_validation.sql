-- ============================================================================
-- 0098 — Market Research + Problem Validation + Information Classification
-- ============================================================================
-- الغرض: تأسيس ثلاث ركائز أساسية لجودة PRD في NEXVORA:
--   (أ) البحث السوقي (Market Research)         — منافسون، اتجاهات، شرائح، تسعير
--   (ب) التحقق من المشكلة (Problem Validation) — مقابلات، استبيانات، أدلة
--   (ج) تصنيف المعلومات (Info Classification)   — unclassified/legacy/needs_review/verified
--
-- ثلاثتهم يشتغلوا قبل Product Definition (P5) — عشان تعريف المنتج يبني على
-- بحث موثّق مش افتراضات. كل الجداول جديدة ومستقلّة — لا لمس أي جدول قديم.
--
-- Backwards-compat: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Market Research Items — أي "عنصر بحث سوقي" حول المشروع
-- ---------------------------------------------------------------------------
-- item_type يمثّل تصنيف العنصر: منافس مباشر/غير مباشر، اتجاه سوق، شريحة
-- مستخدمين، بنية تسعير، تحليل SWOT، إلخ. مفتوح لأن البحث السوقي فطنته
-- تتغيّر من قطاع لآخر (ERP vs SaaS vs Marketplace).

CREATE TABLE IF NOT EXISTS public.market_research_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_type         text        NOT NULL,
  title             text        NOT NULL,
  summary           text        NOT NULL DEFAULT '',
  details           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source_url        text        NULL,
  source_notes      text        NOT NULL DEFAULT '',
  confidence        int         NOT NULL DEFAULT 50,
  tags              text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT mr_item_type_valid CHECK (item_type IN (
    'direct_competitor','indirect_competitor',
    'market_trend','user_segment','pricing_model','swot','other'
  )),
  CONSTRAINT mr_confidence_range CHECK (confidence BETWEEN 0 AND 100)
);

COMMENT ON TABLE public.market_research_items IS
  'كل عنصر بحث سوقي — منافس/اتجاه/شريحة/تسعير/إلخ — بمصدر وثقة رقمية.';

CREATE INDEX IF NOT EXISTS idx_mr_items_project ON public.market_research_items (project_id);
CREATE INDEX IF NOT EXISTS idx_mr_items_type    ON public.market_research_items (item_type);

-- ---------------------------------------------------------------------------
-- 2) Problem Validation Items — دليل تحقق مشكلة (Evidence)
-- ---------------------------------------------------------------------------
-- evidence_type: مقابلة عميل، استبيان، بيانات analytics، فيديو مسجّل،
-- ملاحظة مباشرة، وثيقة داخلية. كل عنصر بيتم ربطه (اختياري) بـ
-- pain_point_id — عبارة نصّية تعرّف الألم اللي بيثبت.

CREATE TABLE IF NOT EXISTS public.problem_validation_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  evidence_type     text        NOT NULL,
  title             text        NOT NULL,
  pain_point        text        NOT NULL,
  quote             text        NOT NULL DEFAULT '',
  source_person     text        NOT NULL DEFAULT '',
  source_role       text        NOT NULL DEFAULT '',
  source_date       date        NULL,
  supporting_url    text        NULL,
  supporting_notes  text        NOT NULL DEFAULT '',
  strength          int         NOT NULL DEFAULT 50,
  tags              text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pv_evidence_type_valid CHECK (evidence_type IN (
    'user_interview','survey','analytics_data','recorded_session',
    'direct_observation','internal_document','support_ticket','other'
  )),
  CONSTRAINT pv_strength_range CHECK (strength BETWEEN 0 AND 100)
);

COMMENT ON TABLE public.problem_validation_items IS
  'أدلة تحقق المشكلة (Problem Validation) — كل دليل مربوط بـ pain_point وقوّة رقمية.';

CREATE INDEX IF NOT EXISTS idx_pv_items_project    ON public.problem_validation_items (project_id);
CREATE INDEX IF NOT EXISTS idx_pv_items_evidence   ON public.problem_validation_items (evidence_type);
CREATE INDEX IF NOT EXISTS idx_pv_items_pain_point ON public.problem_validation_items (project_id, pain_point);

-- ---------------------------------------------------------------------------
-- 3) Information Classification Marks — علامات على معلومات المشروع
-- ---------------------------------------------------------------------------
-- كل معلومة في Brain/Analysis/Discovery ممكن تتصنّف: unclassified (افتراضي)،
-- legacy (من مشروع أقدم — لازم مراجعة)، needs_review (فيها شك)، verified.
-- ما نلمسش الجداول القديمة — بدل كده جدول واحد بيربط عبر
-- (source_table, source_id) — نمط Polymorphic خفيف.

CREATE TABLE IF NOT EXISTS public.information_classification_marks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_table  text        NOT NULL,   -- e.g. 'brain_document', 'discovery_answer', 'analysis_section'
  source_id     text        NOT NULL,   -- id أو مسار داخل المصدر (نستخدم text عشان يقبل uuid/int/composite key)
  classification text       NOT NULL DEFAULT 'unclassified',
  reason        text        NOT NULL DEFAULT '',
  reviewed_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ic_classification_valid CHECK (classification IN (
    'unclassified','legacy','needs_review','verified'
  )),
  -- علامة واحدة فعّالة لكل (project, source_table, source_id) — التحديث upsert
  CONSTRAINT ic_source_uk UNIQUE (project_id, source_table, source_id)
);

COMMENT ON TABLE public.information_classification_marks IS
  'تصنيف معلومات المشروع (unclassified/legacy/needs_review/verified) عبر ربط polymorphic بالجداول القديمة.';

CREATE INDEX IF NOT EXISTS idx_ic_marks_project ON public.information_classification_marks (project_id);
CREATE INDEX IF NOT EXISTS idx_ic_marks_class   ON public.information_classification_marks (classification);

-- ---------------------------------------------------------------------------
-- 4) Triggers لتحديث updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_research_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mr_items_updated_at ON public.market_research_items;
CREATE TRIGGER trg_mr_items_updated_at
BEFORE UPDATE ON public.market_research_items
FOR EACH ROW EXECUTE FUNCTION public.market_research_touch_updated_at();

DROP TRIGGER IF EXISTS trg_pv_items_updated_at ON public.problem_validation_items;
CREATE TRIGGER trg_pv_items_updated_at
BEFORE UPDATE ON public.problem_validation_items
FOR EACH ROW EXECUTE FUNCTION public.market_research_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ic_marks_updated_at ON public.information_classification_marks;
CREATE TRIGGER trg_ic_marks_updated_at
BEFORE UPDATE ON public.information_classification_marks
FOR EACH ROW EXECUTE FUNCTION public.market_research_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS — قراءة للمسجّلين، كتابة عبر service client (RBAC في server actions)
-- ---------------------------------------------------------------------------
ALTER TABLE public.market_research_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_validation_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.information_classification_marks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_items_select ON public.market_research_items;
CREATE POLICY mr_items_select ON public.market_research_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pv_items_select ON public.problem_validation_items;
CREATE POLICY pv_items_select ON public.problem_validation_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS ic_marks_select ON public.information_classification_marks;
CREATE POLICY ic_marks_select ON public.information_classification_marks
  FOR SELECT USING (auth.uid() IS NOT NULL);
