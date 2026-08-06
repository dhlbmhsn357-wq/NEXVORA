-- ============================================================
-- تراجع 0082 — منصّة الذاكرة المؤسسية
--
-- **اقرأ قبل التشغيل:** ده بيحذف كل الخبرات المؤسسية المعتمَدة
-- وإصداراتها ومرشّحيها. **الخبرات المعتمَدة مرّت بمراجعة بشرية** —
-- حذفها فقدان لخبرة مؤسسية تراكمية، لا معرفة مشتقّة قابلة لإعادة
-- التوليد بسهولة (إعادة الاستخلاص ممكنة لكن الاعتماد البشري لأ).
--
-- وزن `org_memory` في knowledge_fusion_weights **لا يُحذَف** — غير مؤذٍ
-- لو بقي.
-- ============================================================

drop function if exists public.org_memory_summary();

drop table if exists public.org_experience_versions;
drop table if exists public.org_experience_candidates;
drop table if exists public.org_promotions;
drop table if exists public.org_experiences;
