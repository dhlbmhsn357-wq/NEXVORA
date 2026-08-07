-- ============================================================================
-- 0105 — Product Handoff Package + External Technical Partner (P12)
-- ============================================================================
-- (أ) Handoff package: 7 عناصر إلزامية + حتى 18 اختياري.
-- (ب) External Partner: عضوية per-project لطرف تقني خارجي (viewer/editor).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Handoff Packages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handoff_packages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version           int         NOT NULL DEFAULT 1,
  title             text        NOT NULL DEFAULT 'Handoff Package',
  status            text        NOT NULL DEFAULT 'draft',
  finalized_at      timestamptz NULL,
  finalized_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT hp_status_valid CHECK (status IN ('draft','ready','finalized','superseded'))
);
CREATE INDEX IF NOT EXISTS idx_hp_project ON public.handoff_packages (project_id);

-- ---------------------------------------------------------------------------
-- 2) Handoff Items — 7 إلزامي + حتى 18 اختياري
-- ---------------------------------------------------------------------------
-- item_key ثابت (enum-like) للـ 25 عنصر المُعرَّفين في lib/handoff/registry.
-- المسمّى المرن (label) في الـ registry بدل CHECK constraint على 25 قيمة.
CREATE TABLE IF NOT EXISTS public.handoff_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid        NOT NULL REFERENCES public.handoff_packages(id) ON DELETE CASCADE,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_key          text        NOT NULL,
  is_mandatory      boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'pending',
  content_url       text        NULL,
  content_text      text        NOT NULL DEFAULT '',
  content_ref_type  text        NULL,    -- 'prd' | 'presentation' | 'brain' | 'file' | 'external'
  content_ref_id    text        NULL,
  notes             text        NOT NULL DEFAULT '',
  completed_at      timestamptz NULL,
  completed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hi_status_valid CHECK (status IN ('pending','in_progress','completed','skipped')),
  CONSTRAINT hi_uniq UNIQUE (package_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_hi_package ON public.handoff_items (package_id);
CREATE INDEX IF NOT EXISTS idx_hi_status  ON public.handoff_items (package_id, status);

-- ---------------------------------------------------------------------------
-- 3) External Partner (per-project membership)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_partners (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  organization      text        NOT NULL DEFAULT '',
  email             text        NOT NULL,
  role              text        NOT NULL DEFAULT 'viewer',
  status            text        NOT NULL DEFAULT 'invited',
  -- Token دخول (يوضع في رابط partner portal مستقبلًا)
  access_token      text        NOT NULL UNIQUE,
  expires_at        timestamptz NULL,
  last_seen_at      timestamptz NULL,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  invited_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at        timestamptz NULL,
  revoke_reason     text        NOT NULL DEFAULT '',
  notes             text        NOT NULL DEFAULT '',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ep_role_valid CHECK (role IN ('viewer','editor')),
  CONSTRAINT ep_status_valid CHECK (status IN ('invited','active','suspended','revoked','expired')),
  CONSTRAINT ep_uniq_email_project UNIQUE (project_id, email)
);
CREATE INDEX IF NOT EXISTS idx_ep_project ON public.external_partners (project_id);
CREATE INDEX IF NOT EXISTS idx_ep_token   ON public.external_partners (access_token);

-- ---------------------------------------------------------------------------
-- 4) Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handoff_touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hp_updated_at ON public.handoff_packages;
CREATE TRIGGER trg_hp_updated_at BEFORE UPDATE ON public.handoff_packages
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hi_updated_at ON public.handoff_items;
CREATE TRIGGER trg_hi_updated_at BEFORE UPDATE ON public.handoff_items
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ep_updated_at ON public.external_partners;
CREATE TRIGGER trg_ep_updated_at BEFORE UPDATE ON public.external_partners
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.handoff_packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_partners  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hp_select ON public.handoff_packages;
CREATE POLICY hp_select ON public.handoff_packages
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS hi_select ON public.handoff_items;
CREATE POLICY hi_select ON public.handoff_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS ep_select ON public.external_partners;
CREATE POLICY ep_select ON public.external_partners
  FOR SELECT USING (auth.uid() IS NOT NULL);
