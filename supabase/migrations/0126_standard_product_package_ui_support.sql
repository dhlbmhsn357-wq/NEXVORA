-- ============================================================================
-- 0126 — حزمة المنتج القياسية (Standard Product Package) — المرحلة د
-- (الأخيرة): دعم الواجهة الكاملة — Fit/Gap Notes
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- السياق: المرحلة د بتوصل الميزة كاملة للواجهة. كل الجداول السابقة
-- (0123/0124/0125) كافية لكل الشاشات الخمسة المطلوبة، ما عدا شاشة واحدة:
-- "Fit/Gap" — ملاحظات مُهيكلة بسيطة على مستوى مشروع الـ Client Variant
-- (إيه ثابت زي ما هو / إيه محتاج إضافة / تعديل / حذف / فروقات تشغيلية)،
-- المواصفة الأصلية صريحة إنها "MVP لملاحظات مُهيكلة + تغييرات، مش إعادة
-- Discovery كاملة" — مفيش أي جدول أو آلية موجودة فعلًا تقدر تحمل الشكل ده
-- (organizational-intelligence/decision-memory أعمّ بكتير وغرضه مختلف)،
-- فجدول صغير جديد هنا قرار حكم مقصود ومحدود النطاق.
--
-- ملاحظات معمارية ثابتة (مطابقة تمامًا لـ 0113-0125):
--   - single-tenant، لا يوجد عمود workspace_id في أي مكان.
--   - RLS مفتوح لأي مستخدم مسجّل دخول (auth.uid() is not null) — المنع
--     الفعلي حسب الدور في lib/auth/rbac.ts::requireRole داخل كل Server
--     Action فقط، مش في RLS.
-- ============================================================================

-- ============================================================
-- fit_gap_notes — صف واحد لكل مشروع (client_project_id unique)، خمس
-- خانات نص حر مُهيكلة. upsert-only من الواجهة (مفيش تاريخ نُسخ — أحدث
-- نسخة فقط، زي أي ملاحظة عمل حية).
-- ============================================================
create table if not exists public.fit_gap_notes (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references public.projects(id) on delete cascade,

  stays_as_is               text not null default '',
  needs_adding               text not null default '',
  needs_modifying            text not null default '',
  needs_removing             text not null default '',
  operational_differences   text not null default '',

  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles(id) on delete set null,

  constraint fit_gap_notes_unique_project unique (project_id)
);

create index if not exists idx_fit_gap_notes_project on public.fit_gap_notes(project_id);

-- ============================================================
-- Row Level Security — نفس نمط 0001/0113/.../0125.
-- ============================================================
alter table public.fit_gap_notes enable row level security;

drop policy if exists internal_read_fit_gap_notes on public.fit_gap_notes;
create policy internal_read_fit_gap_notes on public.fit_gap_notes
  for select using (auth.uid() is not null);

drop policy if exists internal_write_fit_gap_notes on public.fit_gap_notes;
create policy internal_write_fit_gap_notes on public.fit_gap_notes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================================
-- انتهت 0126
-- ============================================================================
