-- ============================================================================
-- 0111 — Handoff immutability + atomic freeze
-- Additive only. NOT auto-applied — user runs manually in Supabase SQL editor.
-- ============================================================================

-- 1. Prevent duplicate snapshots per (package, version)
CREATE UNIQUE INDEX IF NOT EXISTS uq_hps_package_version
  ON public.handoff_package_snapshots (package_id, version);

-- 2. DB-level immutability guard (defense in depth alongside service layer)
CREATE OR REPLACE FUNCTION public.assert_handoff_pkg_mutable() RETURNS trigger AS $$
DECLARE
  s text;
BEGIN
  SELECT status INTO s FROM public.handoff_packages WHERE id = NEW.package_id;
  IF s IN ('finalized','superseded') THEN
    RAISE EXCEPTION 'handoff package is immutable (status=%)', s;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hi_immutable ON public.handoff_items;
CREATE TRIGGER trg_hi_immutable
  BEFORE INSERT OR UPDATE ON public.handoff_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_handoff_pkg_mutable();

-- 3. Atomic freeze RPC — SELECT FOR UPDATE + insert snapshot + status=finalized
--    all in one transaction. Idempotent — re-runs return existing snapshot.
CREATE OR REPLACE FUNCTION public.handoff_freeze_package(
  p_package_id uuid,
  p_user uuid,
  p_payload jsonb
) RETURNS TABLE (
  snapshot_id uuid,
  package_version int,
  was_already_finalized boolean
) LANGUAGE plpgsql AS $$
DECLARE
  v_package RECORD;
  v_snapshot_id uuid;
BEGIN
  SELECT * INTO v_package FROM public.handoff_packages
    WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'package not found: %', p_package_id;
  END IF;

  -- Idempotency: already finalized -> return existing snapshot
  IF v_package.status = 'finalized' THEN
    SELECT id INTO v_snapshot_id FROM public.handoff_package_snapshots
      WHERE package_id = p_package_id AND version = v_package.version
      ORDER BY created_at DESC LIMIT 1;
    RETURN QUERY SELECT v_snapshot_id, v_package.version, true;
    RETURN;
  END IF;

  -- Insert snapshot
  INSERT INTO public.handoff_package_snapshots
    (package_id, project_id, version, payload, created_by)
    VALUES (p_package_id, v_package.project_id, v_package.version, p_payload, p_user)
    RETURNING id INTO v_snapshot_id;

  -- Flip status
  UPDATE public.handoff_packages
    SET status = 'finalized', finalized_at = now(), finalized_by = p_user
    WHERE id = p_package_id;

  RETURN QUERY SELECT v_snapshot_id, v_package.version, false;
END $$;

COMMENT ON FUNCTION public.handoff_freeze_package IS
  'Atomic freeze: SELECT FOR UPDATE on package + insert snapshot + status=finalized in one transaction. Idempotent.';
