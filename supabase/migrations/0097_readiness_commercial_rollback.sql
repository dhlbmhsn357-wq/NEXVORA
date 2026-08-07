-- Rollback for 0097_readiness_commercial
DROP TRIGGER IF EXISTS trg_payment_schedules_updated_at ON public.payment_schedules;
DROP TRIGGER IF EXISTS trg_contracts_updated_at ON public.contracts;
DROP TRIGGER IF EXISTS trg_client_lifecycle_status_updated_at ON public.client_lifecycle_status;
DROP FUNCTION IF EXISTS public.readiness_commercial_touch_updated_at();
DROP TABLE IF EXISTS public.payment_schedules;
DROP TABLE IF EXISTS public.contracts;
DROP TABLE IF EXISTS public.client_lifecycle_status;
DROP TABLE IF EXISTS public.project_readiness_snapshots;
