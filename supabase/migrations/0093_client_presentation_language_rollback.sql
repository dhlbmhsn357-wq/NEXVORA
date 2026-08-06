-- ============================================================
-- تراجع 0093 — يحذف عمود language من client_presentations.
-- ============================================================

alter table public.client_presentations
  drop column if exists language;
