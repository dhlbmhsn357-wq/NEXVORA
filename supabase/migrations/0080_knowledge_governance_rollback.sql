-- ============================================================
-- تراجع 0080 — حوكمة المعرفة والجودة والحزم
--
-- **اقرأ قبل التشغيل:** ده بيحذف سياسات الحوكمة وتقارير الجودة وسجلّ
-- الحزم. **سياسات الحوكمة قرارات بشرية** — حذفها يرجّع دورة الحياة
-- للسلوك الافتراضي (احتفاظ دائم بلا أرشفة). تقارير الجودة والحزم
-- مشتقّة وقابلة لإعادة التوليد.
-- ============================================================

drop function if exists public.knowledge_governance_summary(uuid);

drop table if exists public.knowledge_packages;
drop table if exists public.knowledge_qa_reports;
drop table if exists public.knowledge_governance_policies;
