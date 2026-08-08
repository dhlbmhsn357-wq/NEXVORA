-- ============================================================================
-- 0107 — Operational Additions (Decisions Register + Stage Ownership + Handoff Q&A + Delivery Receipt)
-- ============================================================================
-- إضافات تشغيلية (Additive بالكامل — لا حذف أو تعديل بيانات موجودة):
--   1) product_decisions_register  — سجل موحّد (Assumptions/Risks/Open Questions/Decisions)
--   2) project_stage_assignments   — تعيين مسؤول/مراجع لكل مرحلة v2
--   3) handoff_questions           — أسئلة الشركاء على حزم التسليم
--   4) handoff_deliveries          — سجل استلام حزم التسليم
--   + توسيع evidence_links.source_type لدعم product_decision_item
-- كل الجداول جديدة → صفر خطر توافق. RLS = "أي مستخدم مسجّل" (نمط 0105).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Product Decisions Register — سجل موحّد
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_decisions_register (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_type             text NOT NULL,   -- assumption/risk/open_question/decision
  title                 text NOT NULL,
  description           text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'open',
  priority              text NOT NULL DEFAULT 'medium',
  owner_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date              date NULL,
  impact                text NOT NULL DEFAULT '',
  mitigation            text NOT NULL DEFAULT '',
  resolution            text NOT NULL DEFAULT '',
  decision_date         date NULL,
  linked_requirement_id uuid NULL,   -- soft FK → product_requirements(id)
  linked_story_id       uuid NULL,   -- soft FK → user_stories(id)
  linked_scope_item_id  uuid NULL,   -- reserved
  stage_key             text NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdr_item_type_valid CHECK (item_type IN ('assumption','risk','open_question','decision')),
  CONSTRAINT pdr_status_valid CHECK (status IN ('open','in_review','confirmed','resolved','rejected','deferred')),
  CONSTRAINT pdr_priority_valid CHECK (priority IN ('low','medium','high','critical'))
);
CREATE INDEX IF NOT EXISTS idx_pdr_project        ON public.product_decisions_register(project_id);
CREATE INDEX IF NOT EXISTS idx_pdr_project_type   ON public.product_decisions_register(project_id, item_type);
CREATE INDEX IF NOT EXISTS idx_pdr_project_status ON public.product_decisions_register(project_id, status);

-- ---------------------------------------------------------------------------
-- 2) Project Stage Assignments — تعيين المسؤولين للمراحل السبع
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_stage_assignments (
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_key   text NOT NULL,
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date    date NULL,
  status      text NOT NULL DEFAULT 'not_started',
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, stage_key),
  CONSTRAINT psa_stage_valid CHECK (stage_key IN (
    'client_and_project','discovery_and_research','analysis_and_validation',
    'product_definition','prototype_and_review','client_approval','handoff_and_closure'
  )),
  CONSTRAINT psa_status_valid CHECK (status IN (
    'not_started','in_progress','blocked','ready_for_review','completed'
  ))
);
CREATE INDEX IF NOT EXISTS idx_psa_owner ON public.project_stage_assignments(owner_id) WHERE owner_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Handoff Questions — أسئلة الشركاء على حزمة التسليم
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handoff_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_id   uuid NOT NULL REFERENCES public.handoff_packages(id) ON DELETE CASCADE,
  partner_id   uuid NULL REFERENCES public.external_partners(id) ON DELETE SET NULL,
  question     text NOT NULL,
  answer       text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'open',
  priority     text NOT NULL DEFAULT 'medium',
  asked_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  answered_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  asked_at     timestamptz NOT NULL DEFAULT now(),
  answered_at  timestamptz NULL,
  closed_at    timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hq_status_valid CHECK (status IN ('open','answered','needs_clarification','closed')),
  CONSTRAINT hq_priority_valid CHECK (priority IN ('low','medium','high','critical'))
);
CREATE INDEX IF NOT EXISTS idx_hq_project ON public.handoff_questions(project_id);
CREATE INDEX IF NOT EXISTS idx_hq_package ON public.handoff_questions(package_id);

-- ---------------------------------------------------------------------------
-- 4) Handoff Deliveries — سجل تسليم/استلام الحزمة
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handoff_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_id          uuid NOT NULL REFERENCES public.handoff_packages(id) ON DELETE CASCADE,
  partner_id          uuid NULL REFERENCES public.external_partners(id) ON DELETE SET NULL,
  partner_name        text NOT NULL DEFAULT '',
  receipt_status      text NOT NULL DEFAULT 'pending',
  sent_at             timestamptz NULL,
  sent_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at         timestamptz NULL,
  accepted_at         timestamptz NULL,
  rejected_at         timestamptz NULL,
  status_updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_status_valid CHECK (receipt_status IN (
    'pending','sent','received','accepted','rejected','needs_clarification'
  ))
);
CREATE INDEX IF NOT EXISTS idx_hd_project ON public.handoff_deliveries(project_id);
CREATE INDEX IF NOT EXISTS idx_hd_package ON public.handoff_deliveries(package_id);

-- ---------------------------------------------------------------------------
-- 5) Extend evidence_links.source_type CHECK — إضافة product_decision_item
--    ملاحظة: القيد الأصلي في 0101 اسمه ev_source_type_valid — نُسقط الاسمين
--    القديم والجديد احتياطًا ثم نضيف القيد الموسّع باسم الأصلي.
-- ---------------------------------------------------------------------------
ALTER TABLE public.evidence_links DROP CONSTRAINT IF EXISTS ev_source_type_valid;
ALTER TABLE public.evidence_links DROP CONSTRAINT IF EXISTS el_source_type_valid;
ALTER TABLE public.evidence_links ADD CONSTRAINT ev_source_type_valid CHECK (
  source_type IN ('requirement','user_story','acceptance_criterion','product_decision_item')
);

-- ---------------------------------------------------------------------------
-- 6) Triggers — إعادة استخدام handoff_touch_updated_at() من 0105
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pdr_updated_at ON public.product_decisions_register;
CREATE TRIGGER trg_pdr_updated_at BEFORE UPDATE ON public.product_decisions_register
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

DROP TRIGGER IF EXISTS trg_psa_updated_at ON public.project_stage_assignments;
CREATE TRIGGER trg_psa_updated_at BEFORE UPDATE ON public.project_stage_assignments
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hq_updated_at ON public.handoff_questions;
CREATE TRIGGER trg_hq_updated_at BEFORE UPDATE ON public.handoff_questions
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hd_updated_at ON public.handoff_deliveries;
CREATE TRIGGER trg_hd_updated_at BEFORE UPDATE ON public.handoff_deliveries
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7) RLS — نمط 0105 (SELECT للـ authenticated)
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_decisions_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stage_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_deliveries         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdr_select ON public.product_decisions_register;
CREATE POLICY pdr_select ON public.product_decisions_register
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS psa_select ON public.project_stage_assignments;
CREATE POLICY psa_select ON public.project_stage_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS hq_select ON public.handoff_questions;
CREATE POLICY hq_select ON public.handoff_questions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS hd_select ON public.handoff_deliveries;
CREATE POLICY hd_select ON public.handoff_deliveries
  FOR SELECT USING (auth.uid() IS NOT NULL);
