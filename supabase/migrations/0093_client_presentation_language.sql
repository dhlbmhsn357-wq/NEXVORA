-- ============================================================
-- 0093 — لغة العرض التنفيذي (ثنائي اللغة: عربي/إنجليزي)
-- بيضيف عمود language لجدول client_presentations عشان العرض يتولّد
-- ويُعرض بالعربية (RTL) أو الإنجليزية (LTR) حسب اختيار الـ PM.
-- Additive بالكامل: العروض الحالية بتفضل "ar" افتراضيًّا.
-- ============================================================

alter table public.client_presentations
  add column if not exists language text not null default 'ar'
  check (language in ('ar', 'en'));
