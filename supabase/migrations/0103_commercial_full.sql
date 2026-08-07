-- ============================================================================
-- 0103 — Commercial Full (P10): Proposals + Pricing Packages + Change Requests
-- ============================================================================
-- يبني على P3 (contracts + payment_schedules) بإضافة:
--   • pricing_packages   — قوالب تسعير قابلة لإعادة الاستخدام
--   • proposals          — عروض قابلة للإرسال للعميل بإصدارات
--   • proposal_items     — بنود العرض
--   • change_requests    — طلبات تغيير على مشروع مُعتمَد بأثر على السعر/الوقت
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Pricing Packages (قوالب على مستوى النظام — يعاد استخدامها في العروض)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_packages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  tier              text        NOT NULL DEFAULT 'standard',
  description       text        NOT NULL DEFAULT '',
  base_price        numeric(14,2) NOT NULL DEFAULT 0,
  currency          text        NOT NULL DEFAULT 'EGP',
  features          text[]      NOT NULL DEFAULT '{}',
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pkg_tier_valid CHECK (tier IN ('starter','standard','pro','enterprise','custom')),
  CONSTRAINT pkg_currency_iso CHECK (char_length(currency) = 3),
  CONSTRAINT pkg_price_non_negative CHECK (base_price >= 0)
);
CREATE INDEX IF NOT EXISTS idx_pkg_active ON public.pricing_packages (is_active);

-- ---------------------------------------------------------------------------
-- 2) Proposals (لكل مشروع؛ يمكن أن يكون له أكثر من عرض بإصدارات)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version           int         NOT NULL DEFAULT 1,
  title             text        NOT NULL,
  summary           text        NOT NULL DEFAULT '',
  status            text        NOT NULL DEFAULT 'draft',
  currency          text        NOT NULL DEFAULT 'EGP',
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount   numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount        numeric(14,2) NOT NULL DEFAULT 0,
  total_amount      numeric(14,2) NOT NULL DEFAULT 0,
  valid_until       date        NULL,
  sent_at           timestamptz NULL,
  accepted_at       timestamptz NULL,
  rejected_at       timestamptz NULL,
  linked_package_id uuid        NULL REFERENCES public.pricing_packages(id) ON DELETE SET NULL,
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT proposal_status_valid CHECK (status IN (
    'draft','sent','accepted','rejected','expired','superseded'
  )),
  CONSTRAINT proposal_currency_iso CHECK (char_length(currency) = 3),
  CONSTRAINT proposal_amounts_non_negative CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
  )
);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON public.proposals (project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status  ON public.proposals (project_id, status);

-- ---------------------------------------------------------------------------
-- 3) Proposal Items (بنود العرض — قابلة للحذف مع العرض)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       uuid        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  order_index       int         NOT NULL DEFAULT 1,
  title             text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  quantity          numeric(10,2) NOT NULL DEFAULT 1,
  unit_price        numeric(14,2) NOT NULL DEFAULT 0,
  line_total        numeric(14,2) NOT NULL DEFAULT 0,   -- محسوب من quantity * unit_price في الأكشن
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_quantities_non_negative CHECK (quantity >= 0 AND unit_price >= 0 AND line_total >= 0)
);
CREATE INDEX IF NOT EXISTS idx_prop_items_proposal ON public.proposal_items (proposal_id, order_index);

-- ---------------------------------------------------------------------------
-- 4) Change Requests (على مشروع مُعتمَد — بأثر على السعر/الوقت)
-- ---------------------------------------------------------------------------
-- بحسب خطة v3: البنية تُبنى في P10 لكن تُفعَّل عمليًا بعد Client Approval (P11).
-- الحقل linked_contract_id اختياري لأن الـ CR قد يُنشأ قبل التعاقد أحيانًا.
CREATE TABLE IF NOT EXISTS public.change_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code              text        NULL,
  title             text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  reason            text        NOT NULL DEFAULT '',
  impact_scope      text        NOT NULL DEFAULT '',
  impact_cost       numeric(14,2) NOT NULL DEFAULT 0,
  impact_time_days  int         NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'draft',
  requested_by      text        NOT NULL DEFAULT '',
  linked_contract_id uuid       NULL REFERENCES public.contracts(id) ON DELETE SET NULL,
  linked_proposal_id uuid       NULL REFERENCES public.proposals(id) ON DELETE SET NULL,
  decided_at        timestamptz NULL,
  decided_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_note     text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT cr_status_valid CHECK (status IN (
    'draft','submitted','under_review','approved','rejected','cancelled','implemented'
  )),
  CONSTRAINT cr_impact_valid CHECK (impact_cost >= 0 AND impact_time_days >= 0)
);
CREATE INDEX IF NOT EXISTS idx_cr_project ON public.change_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_cr_status  ON public.change_requests (project_id, status);

-- ---------------------------------------------------------------------------
-- 5) Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commercial_full_touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pkg_updated_at ON public.pricing_packages;
CREATE TRIGGER trg_pkg_updated_at BEFORE UPDATE ON public.pricing_packages
FOR EACH ROW EXECUTE FUNCTION public.commercial_full_touch_updated_at();

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON public.proposals;
CREATE TRIGGER trg_proposals_updated_at BEFORE UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.commercial_full_touch_updated_at();

DROP TRIGGER IF EXISTS trg_cr_updated_at ON public.change_requests;
CREATE TRIGGER trg_cr_updated_at BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.commercial_full_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6) RLS — SELECT only للمسجّلين
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pkg_select ON public.pricing_packages;
CREATE POLICY pkg_select ON public.pricing_packages
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS proposals_select ON public.proposals;
CREATE POLICY proposals_select ON public.proposals
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS prop_items_select ON public.proposal_items;
CREATE POLICY prop_items_select ON public.proposal_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS cr_select ON public.change_requests;
CREATE POLICY cr_select ON public.change_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
