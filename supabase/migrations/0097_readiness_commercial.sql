-- ============================================================================
-- 0097 — Readiness Metrics + Commercial Foundations (NEXVORA P3)
-- ============================================================================
-- الغرض: تأسيس (أ) مقاييس الجاهزية الستة لمشاريع NEXVORA (بديل
-- Engineering/Publishing/Support Readiness القديمة)، و(ب) الأساسيات
-- التجارية اللي تبدأ من تحويل Lead لمشروع (Client Status + Contracts
-- + Payments). Proposals/Pricing/Change Requests الكاملة في P9.
--
-- كل الجداول جديدة — لا لمس أي جدول قائم.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Readiness Snapshots — كاش النسب المحسوبة لكل مشروع + مقياس
-- ---------------------------------------------------------------------------
-- المقاييس الستة الثابتة (مطابقة للـ WorkflowV2Stage keys الأولى ست + Handoff):
--   discovery_completeness      — نسبة اكتمال مرحلة Discovery
--   problem_validation          — نسبة اكتمال Analysis + Validation
--   product_definition_ready    — نسبة اكتمال Product Definition
--   prototype_ready             — نسبة اكتمال Prototype + Review
--   client_approval             — نسبة اكتمال موافقة العميل
--   handoff_ready               — نسبة اكتمال Handoff Package + Acceptance

CREATE TABLE IF NOT EXISTS public.project_readiness_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  metric_key    text        NOT NULL,
  percentage    int         NOT NULL DEFAULT 0,
  breakdown     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_readiness_percentage_range CHECK (percentage BETWEEN 0 AND 100),
  CONSTRAINT project_readiness_metric_valid CHECK (metric_key IN (
    'discovery_completeness',
    'problem_validation',
    'product_definition_ready',
    'prototype_ready',
    'client_approval',
    'handoff_ready'
  )),
  CONSTRAINT project_readiness_uk UNIQUE (project_id, metric_key)
);

COMMENT ON TABLE public.project_readiness_snapshots IS
  'كاش النسب المحسوبة لكل مقياس جاهزية على مستوى المشروع. الحساب الحقيقي يحصل في lib/project-readiness ثم يُخزَّن هنا.';

CREATE INDEX IF NOT EXISTS idx_project_readiness_project ON public.project_readiness_snapshots (project_id);

-- ---------------------------------------------------------------------------
-- 2) Client Lifecycle Status — حالة العميل تجاريًا على مستوى المشروع
-- ---------------------------------------------------------------------------
-- يتم إنشاء صف تلقائيًا لكل مشروع جديد (via app code، مش trigger عشان
-- المشاريع القديمة تفضل بدون تعقيد إضافي).

CREATE TABLE IF NOT EXISTS public.client_lifecycle_status (
  project_id    uuid        PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'prospect',
  notes         text        NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT client_lifecycle_status_valid CHECK (status IN (
    'prospect',      -- Lead اتحوّل لمشروع، لسه في مرحلة الاستكشاف
    'active',        -- المشروع شغّال
    'paused',        -- متوقّف مؤقتًا (انتظار عميل، صعوبة تجارية)
    'completed',     -- سُلِّم بنجاح
    'lost',          -- خسِر (العميل انسحب أو الصفقة ما اكتملت)
    'archived'       -- مؤرشف للرجوع فقط
  ))
);

COMMENT ON TABLE public.client_lifecycle_status IS
  'حالة العميل تجاريًا على مستوى المشروع. يتوسّع في P9 مع Proposals/Pricing.';

-- ---------------------------------------------------------------------------
-- 3) Contracts — عقد المشروع (الأساسيات، تتوسّع في P9)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  total_amount      numeric(14,2) NULL,
  currency          text        NOT NULL DEFAULT 'EGP',
  signed_at         timestamptz NULL,
  signed_by_client  text        NULL,
  document_url      text        NULL,
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT contracts_status_valid CHECK (status IN ('draft','sent','signed','cancelled')),
  CONSTRAINT contracts_currency_iso CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.contracts IS
  'عقود المشاريع (أساسيات). طلبات التغيير والملحقات في P9.';

CREATE INDEX IF NOT EXISTS idx_contracts_project ON public.contracts (project_id);

-- ---------------------------------------------------------------------------
-- 4) Payment Schedules — جدول الدفعات (الأساسيات، تتوسّع في P9)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contract_id       uuid        NULL REFERENCES public.contracts(id) ON DELETE SET NULL,
  installment_no    int         NOT NULL,
  title             text        NOT NULL,
  amount            numeric(14,2) NOT NULL,
  currency          text        NOT NULL DEFAULT 'EGP',
  due_date          date        NULL,
  paid_at           timestamptz NULL,
  status            text        NOT NULL DEFAULT 'pending',
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT payment_status_valid CHECK (status IN ('pending','invoiced','paid','overdue','cancelled')),
  CONSTRAINT payment_amount_positive CHECK (amount >= 0),
  CONSTRAINT payment_installment_positive CHECK (installment_no > 0),
  CONSTRAINT payment_currency_iso CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.payment_schedules IS
  'جدول الدفعات لكل مشروع (أساسيات). Proposals/Pricing/Invoicing الكامل في P9.';

CREATE INDEX IF NOT EXISTS idx_payment_schedules_project ON public.payment_schedules (project_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_status ON public.payment_schedules (status);

-- ---------------------------------------------------------------------------
-- 5) Triggers لتحديث updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.readiness_commercial_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_lifecycle_status_updated_at ON public.client_lifecycle_status;
CREATE TRIGGER trg_client_lifecycle_status_updated_at
BEFORE UPDATE ON public.client_lifecycle_status
FOR EACH ROW EXECUTE FUNCTION public.readiness_commercial_touch_updated_at();

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON public.contracts;
CREATE TRIGGER trg_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.readiness_commercial_touch_updated_at();

DROP TRIGGER IF EXISTS trg_payment_schedules_updated_at ON public.payment_schedules;
CREATE TRIGGER trg_payment_schedules_updated_at
BEFORE UPDATE ON public.payment_schedules
FOR EACH ROW EXECUTE FUNCTION public.readiness_commercial_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6) RLS — قراءة للأعضاء المسجّلين، كتابة عبر service client
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_readiness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_lifecycle_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_readiness_snapshots_select ON public.project_readiness_snapshots;
CREATE POLICY project_readiness_snapshots_select ON public.project_readiness_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS client_lifecycle_status_select ON public.client_lifecycle_status;
CREATE POLICY client_lifecycle_status_select ON public.client_lifecycle_status
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS payment_schedules_select ON public.payment_schedules;
CREATE POLICY payment_schedules_select ON public.payment_schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);
