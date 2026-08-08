-- Rollback 0108 — Prototype Studio
DELETE FROM public.feature_flags WHERE name = 'prototype_studio';
DROP TRIGGER IF EXISTS trg_psc_updated_at ON public.prototype_studio_configs;
DROP INDEX IF EXISTS public.idx_psa_active;
DROP INDEX IF EXISTS public.idx_psa_project_type;
DROP TABLE IF EXISTS public.prototype_studio_artifacts;
DROP TABLE IF EXISTS public.prototype_studio_configs;
