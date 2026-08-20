-- ============================================================================
-- 0123 — حزمة المنتج القياسية (Standard Product Package) — المرحلة أ:
-- وضع سير عمل المشروع + Sector Standard + استنساخ Client Variant
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- السياق: NEXVORA محتاجة مسار تشغيلي جديد: بناء "حزمة منتج قياسية" كاملة
-- مرة واحدة لكل قطاع (مثال: "Clinic Standard v1.3")، ثم تفريع مشروع
-- "Client Variant" لكل عميل فعلي عن طريق استنساخ (لقطة، مش وراثة حيّة)
-- بيانات المنتج من الـ Standard، وتتبّع الفروقات فقط (Change Requests) في
-- مراحل لاحقة. المرحلة أ هنا تبني الأساس فقط: عمود وضع سير العمل + مفهوم
-- Sector Standard + خدمة الاستنساخ. المراحل ب/ج/د (طلبات التغيير + تحليل
-- الأثر بالذكاء الاصطناعي + Prototype Change Prompt + الواجهة الكاملة)
-- مهام منفصلة لاحقة.
--
-- ملاحظات معمارية ثابتة (مطابقة تمامًا لـ 0113-0122):
--   - single-tenant، لا يوجد عمود workspace_id في أي مكان.
--   - RLS مفتوح لأي مستخدم مسجّل دخول (auth.uid() is not null) — المنع
--     الفعلي حسب الدور في lib/auth/rbac.ts::requireRole داخل كل Server
--     Action فقط، مش في RLS.
--   - عمود project_type الموجود بالفعل على projects (0001) يصف "نوع
--     المنتج" (website/mobile_app/...) — مش له علاقة بالمرحلة دي، ما
--     بيتلمسش. عمود workflow_version الموجود (0096) يصف "معمارية مراحل
--     المشروع" (v1/v2) — أيضًا مش له علاقة، ما بيتلمسش. عمود mode
--     الموجود (unclassified/test/real) يصف تصنيف المنتج (استخدامه
--     الحالي مثلًا في علامة مائية Handoff PDF) — أيضًا محور مختلف تمامًا،
--     ما بيتلمسش. العمود الجديد هنا (workflow_mode) محور رابع مستقل
--     تمامًا: "هل المشروع ده بدأ Discovery كامل من الصفر، ولا هو Client
--     Variant مبني على Sector Standard؟".
-- ============================================================================

-- ============================================================
-- 1) projects — أعمدة إضافية (additive بالكامل)
-- ============================================================
alter table public.projects
  -- 'full_discovery' (المسار الحالي، الافتراضي — صفر تأثير على مشاريع
  -- موجودة) أو 'standard_based' (مشروع عميل مبني على Sector Standard).
  add column if not exists workflow_mode text not null default 'full_discovery'
    check (workflow_mode in ('full_discovery', 'standard_based')),

  -- true فقط للمشروع اللي هو نفسه الـ Standard الأصلي لقطاع (مش عميل).
  add column if not exists is_sector_standard boolean not null default false,

  -- اسم القطاع + رقم إصدار الـ Standard (بس للمشاريع اللي
  -- is_sector_standard = true). مثال: sector_name='عيادات',
  -- standard_version='1.3'.
  add column if not exists sector_name text,
  add column if not exists standard_version text;

create index if not exists idx_projects_workflow_mode on public.projects(workflow_mode);
create index if not exists idx_projects_is_sector_standard on public.projects(is_sector_standard)
  where is_sector_standard = true;

-- ============================================================
-- 2) project_standard_links — ربط مشروع العميل بالـ Standard اللي اتنسخ
-- منه. علاقة واحد-لواحد (مشروع عميل واحد ↔ لقطة استنساخ واحدة)، مفروضة
-- عبر unique على client_project_id.
-- ============================================================
create table if not exists public.project_standard_links (
  id                    uuid primary key default gen_random_uuid(),
  client_project_id     uuid not null references public.projects(id) on delete cascade,
  standard_project_id   uuid not null references public.projects(id) on delete set null,

  -- لقطة نصّية لرقم إصدار الـ Standard وقت الاستنساخ — بتفضل صحيحة حتى لو
  -- standard_project_id اتمسح أو standard_version اتغيّر بعد كده (المشروع
  -- العميل ثابت على النسخة اللي بدأ منها، مش inheritance حيّ).
  standard_version_snapshot text not null,
  cloned_at             timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null,

  constraint project_standard_links_unique_client unique (client_project_id)
);

create index if not exists idx_project_standard_links_client on public.project_standard_links(client_project_id);
create index if not exists idx_project_standard_links_standard on public.project_standard_links(standard_project_id);

-- ============================================================
-- Row Level Security — نفس نمط 0001/0113/0120/0122: أي مستخدم مسجّل
-- دخول مسموح له بالقراءة/الكتابة على مستوى RLS؛ منع الأدوار الفعلي في
-- Server Actions (lib/auth/rbac.ts::requireRole).
-- ============================================================
alter table public.project_standard_links enable row level security;

drop policy if exists internal_read_project_standard_links on public.project_standard_links;
create policy internal_read_project_standard_links on public.project_standard_links
  for select using (auth.uid() is not null);

drop policy if exists internal_write_project_standard_links on public.project_standard_links;
create policy internal_write_project_standard_links on public.project_standard_links
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================================
-- انتهت 0123
-- ============================================================================
