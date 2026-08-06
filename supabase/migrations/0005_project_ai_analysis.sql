-- ============================================================
-- Phase 3 — Analysis Agent: تخزين آخر تحليل لكل مشروع
-- إضافة عمود واحد بس على جدول projects الموجود، لا تعديل على أي شيء آخر.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

alter table public.projects
  add column if not exists ai_analysis jsonb;
