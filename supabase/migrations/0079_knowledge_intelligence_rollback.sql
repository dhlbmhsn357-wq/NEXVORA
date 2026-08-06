-- ============================================================
-- تراجع 0079 — محرّك ذكاء المعرفة
--
-- **اقرأ قبل التشغيل:** ده بيحذف الرؤى الاستشارية ودرجات النضج وسياسات
-- التحديث. الرؤى والدرجات **مشتقّة** (قابلة لإعادة التوليد بنداء ذكاء
-- اصطناعي)، لكن **سياسات التحديث قرارات بشرية** — حذفها بيرجّع كل
-- الموديولات للسلوك الافتراضي (موافقة يدوية).
-- ============================================================

drop function if exists public.knowledge_intelligence_summary(uuid);

drop table if exists public.knowledge_update_policies;
drop table if exists public.knowledge_intelligence_scores;
drop table if exists public.knowledge_insights;
