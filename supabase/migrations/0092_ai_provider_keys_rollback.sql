-- ============================================================
-- 0092 — تراجع مفاتيح مزوّدي الذكاء الاصطناعي
-- يحذف جدول المفاتيح فقط. الإعداد عبر متغيّرات البيئة يظل يعمل.
-- ============================================================

drop trigger if exists on_ai_provider_keys_touch on public.ai_provider_keys;
drop table if exists public.ai_provider_keys cascade;
