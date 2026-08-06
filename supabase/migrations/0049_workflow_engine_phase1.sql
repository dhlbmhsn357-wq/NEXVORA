-- ============================================================
-- Workflow Engine (Phase 1) — إضافات Additive بحتة فقط، مفيش أي DROP
-- أو تعديل هدّام. الهدف: (1) توسعة أدوار profiles.role عشان تدعم
-- الـ 6 أدوار المطلوبة في تصميم الـ Workflow Engine الجديد (التفعيل
-- الفعلي لسه محدود بـ owner/admin/member لحد ما يتاخد قرار تنظيمي مين
-- فعليًا Reviewer/Developer/QA/Support — موضّح في lib/workflow/
-- permissions.ts)، و(2) أعمدة اعتماد بشري (PM Approval Gate) لمرحلتي
-- "Engineering QA Review" و"Production Monitoring Review" الجديدتين،
-- لأن قرار الاعتماد ده حالة حقيقية لازم تتخزن (زي أي حاجة تانية في
-- المشروع ده اتحل فيها مشكلة "بيضيع لو عملت Refresh" قبل كده).
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) توسعة profiles.role — الأدوار الجديدة مُضافة جنب الموجودين، مش
-- بديلة لهم. أي صف موجود فعليًا مش هيتأثر (لسه owner/admin/member).
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'member', 'reviewer', 'developer', 'qa', 'support'));

-- ============================================================
-- 2) بوابة اعتماد "Engineering QA Review" على engineering_reviews —
-- نفس الصف الموجود أصلًا لكل مراجعة، مفيش جدول جديد.
-- ============================================================
alter table public.engineering_reviews add column if not exists pm_approval_status text
  check (pm_approval_status in ('approved', 'rejected'));
alter table public.engineering_reviews add column if not exists pm_approved_by uuid references public.profiles(id) on delete set null;
alter table public.engineering_reviews add column if not exists pm_approved_at timestamptz;

-- ============================================================
-- 3) بوابة اعتماد "Production Monitoring Review" على monitoring_checks
-- — نفس فكرة (2) بالظبط لكن على آخر فحص إنتاج.
-- ============================================================
alter table public.monitoring_checks add column if not exists pm_approval_status text
  check (pm_approval_status in ('approved', 'rejected'));
alter table public.monitoring_checks add column if not exists pm_approved_by uuid references public.profiles(id) on delete set null;
alter table public.monitoring_checks add column if not exists pm_approved_at timestamptz;
