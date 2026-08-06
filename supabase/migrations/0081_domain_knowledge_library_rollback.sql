-- ============================================================
-- تراجع 0081 — مكتبة معرفة المجال ومحرّك الدمج
--
-- **اقرأ قبل التشغيل:** ده بيحذف كل حزم المجال وبنودها واختيارات
-- المشاريع وأوزان الدمج. **حزم المجال خبرة يؤلّفها المدير يدويًا** —
-- حذفها فقدان لعمل بشري، لا معرفة مشتقّة قابلة لإعادة التوليد.
-- ============================================================

drop function if exists public.domain_library_summary();

drop table if exists public.project_domain_packages;
drop table if exists public.knowledge_fusion_weights;
drop table if exists public.domain_package_items;
drop table if exists public.domain_packages;
