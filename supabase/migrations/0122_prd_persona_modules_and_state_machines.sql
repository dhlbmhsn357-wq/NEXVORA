-- ============================================================================
-- 0122 — تقسيم PRD حسب الشخصيات/الموديلات + آلات الحالة (State Machines)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- المقارنة مع "مثاني" (PRD خارجي حقيقي فائق التفصيل لتطبيق تحفيظ قرآن) كشفت
-- فجوتين هيكليتين متبقيتين في PRD الحالي (بعد 0116):
--
--   (1) مثاني بيقسّم كل حاجة حسب الموديول/الشخصية (Student Module / Teacher
--       Module / Admin Module...) — PRD عندنا قايمة مسطّحة واحدة لكل نوع قسم
--       (كل الـ stories مع بعض، كل الـ requirements مع بعض...) مش مُقسّمة
--       حسب الشخصية.
--   (2) مثاني عنده آلات حالة صريحة (State Machines) — مثال:
--       Request Received → Scheduled → Ready → Live → Evaluated → Passed/Failed
--       — عندنا مفيش التقاط مُهيكل لده أصلًا؛ أقرب حاجة هي دفن سلسلة
--       انتقالات كنص حر جوه business_rules.
--
-- الحل هنا لقسمين:
--   (أ) persona_modules — قسم PRD جديد (تجميع/عرض فقط، مش تخزين جديد):
--       لقطة مجمّدة وقت التوليد بتعيد تجميع البيانات الموجودة بالفعل
--       (stories/requirements/business_rules/system_messages/flow_specifications)
--       حسب linked_persona_id/persona_id الموجود بالفعل — زيرو اختراع لأنه
--       مجرد إعادة تجميع لمحتوى مُهيكَل مُلتقط بالفعل.
--   (ب) state_machines_detail — قسم PRD جديد حقيقي، مصدره جدول state_machines
--       الجديد تحت — نفس ضمان "المستخدم بيكتبه، الـ AI ممنوع يخترعه" المطبّق
--       على business_rules_detail/system_messages_detail (0116).
--
-- ملاحظة معمارية: نفس نمط 0116/0117/0120 بالظبط — single-tenant، لا يوجد
-- عمود workspace_id، RLS مفتوح لأي مستخدم مسجّل دخول (auth.uid() is not
-- null)، والمنع الفعلي حسب الدور في lib/auth/rbac.ts::requireRole داخل كل
-- Server Action فقط.
-- ============================================================================

-- ============================================================
-- 1) ربط شخصية اختياري لـ business_rules/system_messages — user_stories
-- (linked_persona_id) و requirements/user_flows (linked_persona_id/persona_id)
-- عندهم الربط ده بالفعل. هنا نكمّل الفجوة الوحيدة المتبقية.
-- ============================================================
alter table public.business_rules
  add column if not exists linked_persona_id uuid references public.product_personas(id) on delete set null;

alter table public.system_messages
  add column if not exists linked_persona_id uuid references public.product_personas(id) on delete set null;

create index if not exists idx_business_rules_linked_persona on public.business_rules(linked_persona_id);
create index if not exists idx_system_messages_linked_persona on public.system_messages(linked_persona_id);

-- ============================================================
-- 2) state_machines — سطح إدخال مُهيكل بسيط: تسلسل حالات + انتقالات وصفية
-- (زي "Request Received → Scheduled → Ready → Live → Evaluated →
-- Passed/Failed" في مثاني). عمدًا بسيط — بدون بيانات رسم بياني بصري،
-- بيتعرض في الواجهة كنص/سلسلة أسهم زي ما مثاني نفسه بيعرضها.
-- ============================================================
create table if not exists public.state_machines (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,

  name              text not null,               -- اسم الآلة (مثال: "دورة حياة طلب الاختبار")
  description       text not null default '',
  states            jsonb not null default '[]'::jsonb,  -- ["Request Received", "Scheduled", ...] بالترتيب
  transitions       jsonb not null default '[]'::jsonb,  -- [{from, to, trigger}] وصف الانتقالات (اختياري تفصيليًا)

  linked_persona_id uuid references public.product_personas(id) on delete set null,
  linked_flow_id    uuid references public.user_flows(id) on delete set null,
  notes             text not null default '',

  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_state_machines_project on public.state_machines(project_id);
create index if not exists idx_state_machines_linked_persona on public.state_machines(linked_persona_id);
create index if not exists idx_state_machines_linked_flow on public.state_machines(linked_flow_id);

-- إعادة استخدام نفس الـ trigger function العامة اللي 0116 عرّفها
-- (touch_business_rule_updated_at) — بالرغم من الاسم، هي عامة تمامًا
-- (بترجع NEW.updated_at = now() بدون أي منطق خاص بجدول business_rules)،
-- ونفس النمط اتّبع فعلًا مع system_messages في 0116. مفيش داعي لدالة جديدة.
drop trigger if exists on_state_machine_update_touch on public.state_machines;
create trigger on_state_machine_update_touch
  before update on public.state_machines
  for each row execute procedure public.touch_business_rule_updated_at();

-- ============================================================
-- 3) prd + prd_versions — عمودان إضافيان (16 قسم إجمالي، بعد ما كانوا 14 من
-- 0116). نفس نمط "لقطة مجمّدة وقت التوليد" المُتّبع لباقي أقسام prd —
-- مش joins حيّة، مش هتتغيّر لو اتعدّلت الجداول المصدر بعد كده لحد ما PRD
-- يتولّد تاني.
--
-- persona_modules: قسم تجميع/عرض بحت — يُبنى بالكامل وقت التوليد من
-- السجلات المرتبطة بالفعل (stories/requirements/business_rules/
-- system_messages/flow_specifications + روابطها بالشخصيات) — لا يُضيف أي
-- تخزين مكرّر، هو لقطة محسوبة زي باقي أقسام PRD المُهيكلة.
--
-- state_machines_detail: قسم zero-invention جديد بالكامل، مصدره حصريًا
-- جدول state_machines أعلاه (نفس ضمان "المستخدم بيكتبه، الـ AI ممنوع
-- يخترعه" المطبّق على business_rules_detail/system_messages_detail).
-- ============================================================
alter table public.prd
  add column if not exists persona_modules jsonb not null default '[]'::jsonb,
  add column if not exists state_machines_detail jsonb not null default '[]'::jsonb;

alter table public.prd_versions
  add column if not exists persona_modules jsonb,
  add column if not exists state_machines_detail jsonb;

-- ============================================================
-- Row Level Security — نفس نمط 0001/0113/0115/0116: أي مستخدم مسجّل دخول
-- مسموح له بالقراءة/الكتابة على مستوى RLS؛ منع الأدوار الفعلي في
-- Server Actions (lib/auth/rbac.ts::requireRole).
-- ============================================================
alter table public.state_machines enable row level security;

create policy "internal_read_state_machines" on public.state_machines
  for select using (auth.uid() is not null);
create policy "internal_write_state_machines" on public.state_machines
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
