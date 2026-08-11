-- ============================================================================
-- 0110 — Handoff auto-assembly source linking + snapshot
-- Additive only. All new fields NULL-able / DEFAULT-safe for backfill.
-- ============================================================================

-- 1. Source linking columns on handoff_items
ALTER TABLE public.handoff_items
  ADD COLUMN IF NOT EXISTS source_type          text        NULL,
  ADD COLUMN IF NOT EXISTS source_version       text        NULL,
  ADD COLUMN IF NOT EXISTS source_hash          text        NULL,
  ADD COLUMN IF NOT EXISTS assembled_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS assembled_by         text        NULL,
  ADD COLUMN IF NOT EXISTS is_manual_override   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason      text        NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_hi_source
  ON public.handoff_items (package_id, source_type);

COMMENT ON COLUMN public.handoff_items.source_type IS
  'brain | prd | stories | ac | requirements | staging_url | evaluation | manual — resolver identifier';
COMMENT ON COLUMN public.handoff_items.source_version IS
  'Version pin: prd.version, brain.version, or "listhash" for list-based items';
COMMENT ON COLUMN public.handoff_items.source_hash IS
  'sha256 of sorted ids+updated_at for list-based sources (stories/ac/requirements)';
COMMENT ON COLUMN public.handoff_items.is_manual_override IS
  'true when user manually edited an auto-filled row; blocks re-assembly from overwriting';

-- 2. Frozen package snapshots (Formal Delivery)
CREATE TABLE IF NOT EXISTS public.handoff_package_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   uuid        NOT NULL REFERENCES public.handoff_packages(id) ON DELETE CASCADE,
  project_id   uuid        NOT NULL REFERENCES public.projects(id)         ON DELETE CASCADE,
  version      int         NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_hps_package ON public.handoff_package_snapshots (package_id);
CREATE INDEX IF NOT EXISTS idx_hps_project ON public.handoff_package_snapshots (project_id, created_at DESC);

ALTER TABLE public.handoff_package_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hps_select ON public.handoff_package_snapshots;
CREATE POLICY hps_select ON public.handoff_package_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
