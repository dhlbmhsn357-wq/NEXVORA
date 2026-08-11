-- Rollback 0110 — Handoff auto-assembly source linking + snapshot
-- Reverses additive changes only. Idempotent.

DROP TABLE IF EXISTS public.handoff_package_snapshots;

DROP INDEX IF EXISTS public.idx_hi_source;

ALTER TABLE public.handoff_items
  DROP COLUMN IF EXISTS override_reason,
  DROP COLUMN IF EXISTS is_manual_override,
  DROP COLUMN IF EXISTS assembled_by,
  DROP COLUMN IF EXISTS assembled_at,
  DROP COLUMN IF EXISTS source_hash,
  DROP COLUMN IF EXISTS source_version,
  DROP COLUMN IF EXISTS source_type;
