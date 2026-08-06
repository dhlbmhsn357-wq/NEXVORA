-- ============================================================
-- تراجع 0076 — أساسات مركز المعرفة
--
-- **اقرأ قبل التشغيل:** ده بيحذف كل تاريخ إصدارات المعرفة، والخط
-- الزمني، ودرجات الجودة. البيانات دي **مالهاش مصدر تاني** — مش مشتقّة
-- من حاجة يمكن إعادة حسابها.
--
-- لو الهدف إيقاف الاستخدام لا الحذف: بطّل المسارات في الكود وسيب
-- الجداول. جدول غير مستخدَم تكلفته صفر تقريبًا؛ وتاريخ محذوف لا يرجع.
--
-- الأعمدة المضافة على الجداول القائمة **لا تُحذف هنا** عن قصد: حذف
-- عمود بيقطع أي كود لسه بيقراه، والعمود الفاضي غير ضار. لو لازم
-- تتشال، شيلها يدويًا بعد التأكّد من عدم وجود أي مستدعٍ.
-- ============================================================

drop function if exists public.knowledge_hub_health(uuid);

drop table if exists public.knowledge_quality_snapshots;
drop table if exists public.knowledge_permission_grants;
drop table if exists public.knowledge_timeline;
drop table if exists public.knowledge_object_versions;

-- مساحات العمل آخر حاجة: المشاريع والمعرفة بتشير لها.
-- المرجع على `projects.workspace_id` هو `on delete restrict`، فلازم
-- يتفضّى الأول.
alter table public.projects drop constraint if exists projects_workspace_id_fkey;
alter table public.knowledge_items drop constraint if exists knowledge_items_workspace_id_fkey;
alter table public.knowledge_sources drop constraint if exists knowledge_sources_workspace_id_fkey;

drop table if exists public.workspaces;
