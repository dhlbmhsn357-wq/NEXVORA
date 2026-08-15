-- ============================================================================
-- 0116 — Detailed Implementation-Spec Capture (قواعد العمل + رسائل النظام)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- المشكلة: PRD الحالي (11 قسم استراتيجي) أضحل بكتير من مواصفة وظيفية حقيقية
-- يقدر مطوّر يبني منها مباشرة — ناقصه: تفاصيل حقول الواجهة والتحقق لكل خطوة
-- تدفّق، جدول كامل بكل رسائل نجاح/خطأ في المنتج، وحالات حافة قواعد العمل
-- (زي "3 محاولات إعادة جدولة كحد أقصى"، "امنع السحب لو المبلغ أكبر من الرصيد").
-- الـ AI منقدرش يخترع التفاصيل دي — الحل: سطح إدخال مُهيكل يكتبه المستخدم
-- بنفسه، يتغذّى منه توليد PRD كمصدر أساسي مضمون الوجود (zero invention).
--
-- ملاحظة معمارية مهمة: هذا المشروع single-tenant بالكامل — لا يوجد عمود
-- workspace_id في أي جدول (راجع 0001_phase1_schema.sql). الـ RBAC يتم عبر
-- profiles.role (owner/admin/supervisor/member) في Server Actions فقط —
-- RLS هنا مطابق لنفس نمط 0001/0113/0115: أي مستخدم مسجّل دخول (auth.uid()
-- is not null) مسموح له بالقراءة والكتابة على مستوى RLS، والمنع الفعلي حسب
-- الدور يتم في lib/auth/rbac.ts::requireRole داخل كل Server Action.
--
-- تمييز مهم بين نوعين من الجداول هنا:
--   • business_rules / system_messages: جداول حيّة قابلة للتعديل المستمر —
--     سطح الإدخال المُهيكل للمستخدم (Live editable input surface).
--   • أعمدة prd الثلاثة الجديدة تحت (business_rules_detail/system_messages_detail/
--     flow_specifications): لقطة مجمّدة (Frozen Snapshot) تُلتقط وقت توليد PRD،
--     تمامًا زي user_stories/acceptance_criteria الموجودين بالفعل في prd —
--     مش joins حيّة، ومش هيتغيّروا لو اتعدّل business_rules بعد كده لحد ما
--     PRD يتولّد تاني. هذا يطابق معمارية prd الحالية تمامًا (0010_prd.sql).
-- ============================================================================

-- ============================================================
-- 1) business_rules — قواعد العمل والحالات الخاصة (مستوى تعريف المنتج،
-- منفصل عن business_rules الحرّة في Project Brain / BRAIN_SECTION)
-- ============================================================
create table if not exists public.business_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,

  title text not null, -- اسم القاعدة
  trigger_condition text not null default '', -- الشرط المُفعِّل
  threshold_value text not null default '', -- القيمة الحدّية (نص حر)
  on_violation text not null default '', -- ماذا يحدث عند التجاوز
  enforcement_point text not null default 'server'
    check (enforcement_point in ('client', 'server', 'both')),
  linked_flow_id uuid references public.user_flows(id) on delete set null,
  notes text not null default '',

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_rules_project on public.business_rules(project_id);
create index if not exists idx_business_rules_linked_flow on public.business_rules(linked_flow_id);

create or replace function public.touch_business_rule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_business_rule_update_touch on public.business_rules;
create trigger on_business_rule_update_touch
  before update on public.business_rules
  for each row execute procedure public.touch_business_rule_updated_at();

-- ============================================================
-- 2) system_messages — جدول كامل بكل رسائل النظام (نجاح/خطأ/معلومة/تحذير)
-- ============================================================
create table if not exists public.system_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,

  event_name text not null, -- اسم الحدث ("تسجيل دخول ناجح", "رصيد غير كافٍ")
  message_type text not null default 'info'
    check (message_type in ('success', 'error', 'info', 'warning')),
  message_text text not null default '', -- نص الرسالة كاملًا كما يظهر للمستخدم
  linked_flow_id uuid references public.user_flows(id) on delete set null,
  notes text not null default '',

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_messages_project on public.system_messages(project_id);
create index if not exists idx_system_messages_linked_flow on public.system_messages(linked_flow_id);

drop trigger if exists on_system_message_update_touch on public.system_messages;
create trigger on_system_message_update_touch
  before update on public.system_messages
  for each row execute procedure public.touch_business_rule_updated_at();

-- ============================================================
-- 3) prd — 3 أعمدة إضافية (لقطة مجمّدة وقت التوليد، مش جداول حيّة)
-- ============================================================
alter table public.prd
  add column if not exists business_rules_detail jsonb not null default '[]'::jsonb,
  add column if not exists system_messages_detail jsonb not null default '[]'::jsonb,
  add column if not exists flow_specifications jsonb not null default '[]'::jsonb;

alter table public.prd_versions
  add column if not exists business_rules_detail jsonb,
  add column if not exists system_messages_detail jsonb,
  add column if not exists flow_specifications jsonb;

-- ============================================================
-- Row Level Security — نفس نمط 0001/0113/0115: أي مستخدم مسجّل دخول
-- مسموح له بالقراءة/الكتابة على مستوى RLS؛ منع الأدوار الفعلي في
-- Server Actions (lib/auth/rbac.ts::requireRole).
-- ============================================================
alter table public.business_rules enable row level security;
alter table public.system_messages enable row level security;

create policy "internal_read_business_rules" on public.business_rules
  for select using (auth.uid() is not null);
create policy "internal_write_business_rules" on public.business_rules
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_system_messages" on public.system_messages
  for select using (auth.uid() is not null);
create policy "internal_write_system_messages" on public.system_messages
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
