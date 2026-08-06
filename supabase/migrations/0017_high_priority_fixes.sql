-- ============================================================
-- Post-Audit Hardening — High Priority Fixes
-- 1) Indexes على أعمدة الفلترة الأكثر استخدامًا (projects.stage, leads.status)
-- 2) تتبّع Share Tokens (إنشاء + آخر استخدام) لكل مصادر الروابط العامة
-- 3) توثيق حالة "reopened" كقيمة مسموحة في stage (نص حر، مش check قسري)
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) فهارس على أعمدة الفلترة — تفضل النتائج سريعة مع نمو البيانات
-- ============================================================
create index if not exists idx_projects_stage
  on public.projects(stage)
  where archived_at is null;

create index if not exists idx_leads_status
  on public.leads(status)
  where archived_at is null;

-- ============================================================
-- 2) تتبّع Share Tokens — لكل مصدر رابط عام (Presentation, Handoff,
--    Widget). الأعمدة nullable — لو null يعني مفيش تفعيل قط.
-- ============================================================
alter table public.client_presentations
  add column if not exists share_token_created_at timestamptz,
  add column if not exists share_token_last_used_at timestamptz;

alter table public.developer_handoff
  add column if not exists share_token_created_at timestamptz,
  add column if not exists share_token_last_used_at timestamptz;

alter table public.projects
  add column if not exists widget_key_created_at timestamptz,
  add column if not exists widget_key_last_used_at timestamptz;

-- ============================================================
-- 3) دورة حياة المشروع الموسّعة — قيمة "reopened" مسموحة كنص حر
--    (العمود stage هو text مش enum من التصميم الأصلي، فمفيش تعديل schema
--    مطلوب، بس توثيق للفريق).
-- ============================================================
-- لا شيء يُنفَّذ هنا — القيمة "reopened" ستُستخدم في طبقة التطبيق
-- كامتداد لقيم stage القائمة.
