-- ============================================================
-- تراجع 0077 — محرّك معالجة المعرفة
--
-- **اقرأ قبل التشغيل:** ده بيحذف كل الكيانات وقواعد العمل وسير العمل
-- والمتطلبات والقرارات والمخاطر المستخرَجة. البيانات دي **مشتقّة**
-- من المصادر، فيمكن إعادة استخراجها — لكن ذلك يكلّف نداءات ذكاء
-- اصطناعي من جديد.
--
-- لو الهدف إيقاف الاستخدام لا الحذف: بطّل المسارات في الكود وسيب
-- الجداول. جدول غير مستخدَم تكلفته صفر تقريبًا.
-- ============================================================

drop function if exists public.knowledge_processing_summary(uuid);

drop table if exists public.knowledge_domain_completeness;
drop table if exists public.knowledge_risks;
drop table if exists public.knowledge_decisions;
drop table if exists public.knowledge_requirements;
drop table if exists public.knowledge_workflow_steps;
drop table if exists public.knowledge_workflows;
drop table if exists public.knowledge_business_rules;
drop table if exists public.knowledge_entity_relations;
drop table if exists public.knowledge_entities;
