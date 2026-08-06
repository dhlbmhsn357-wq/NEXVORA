-- ============================================================
-- Post-Audit Hardening — Low Priority Fixes
-- 1) assigned_to على support_requests (تعيين مسؤول للمتابعة)
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

alter table public.support_requests
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_support_requests_assigned
  on public.support_requests(assigned_to)
  where assigned_to is not null;
