-- Rollback for 0111
DROP FUNCTION IF EXISTS public.handoff_freeze_package(uuid, uuid, jsonb);
DROP TRIGGER IF EXISTS trg_hi_immutable ON public.handoff_items;
DROP FUNCTION IF EXISTS public.assert_handoff_pkg_mutable();
DROP INDEX IF EXISTS uq_hps_package_version;
