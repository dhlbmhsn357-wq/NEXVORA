-- Rollback for 0095_feature_flags
DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON public.feature_flags;
DROP FUNCTION IF EXISTS public.feature_flags_touch_updated_at();
DROP TABLE IF EXISTS public.feature_flags;
