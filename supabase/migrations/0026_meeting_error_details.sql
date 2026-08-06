-- ============================================================
-- PM Operating System — 0026 Meeting error details
--
-- يضيف على meetings عمودَي error_code / error_message عشان الفشل يبقى
-- مفهوم في الواجهة بدل مجرد "فشل" بلا سبب. إضافي بحت، idempotent.
-- ============================================================

alter table public.meetings
  add column if not exists error_code text,
  add column if not exists error_message text;

-- ============================================================
-- انتهى 0026
-- ============================================================
