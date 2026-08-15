-- ============================================================================
-- 0115 — Prospecting Database (قاعدة الاستهداف)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- موديول جديد بين Discovery وLeads: يستقبل ملفات Excel/CSV من أبحاث السوق،
-- ينظّم الجهات المستهدفة (Prospects)، يسهّل التواصل عبر WhatsApp (رابط
-- مباشر بدون API)، ويسجّل نتيجة التواصل. لا تتحول الجهة إلى Lead إلا بعد
-- أن ترد وتُظهر اهتمامًا حقيقيًا.
--
-- Prospect ≠ Lead ≠ Client ≠ Project:
--   Prospect: جهة جمعنا بياناتها ولم تُظهر اهتمامًا بعد.
--   Lead:     جهة ردّت وأظهرت اهتمامًا حقيقيًا (نظام leads الحالي).
--
-- ملاحظة معمارية مهمة: هذا المشروع single-tenant بالكامل — لا يوجد عمود
-- workspace_id في أي جدول (راجع 0001_phase1_schema.sql). الـ RBAC يتم عبر
-- profiles.role (owner/admin/supervisor/member) في Server Actions فقط —
-- RLS هنا مطابق لنفس نمط 0001 و0113: أي مستخدم مسجّل دخول (auth.uid() is
-- not null) مسموح له بالقراءة والكتابة على مستوى RLS، والمنع الفعلي حسب
-- الدور يتم في lib/auth/rbac.ts::requireRole داخل كل Server Action. السبب
-- (من lib/auth/rbac.ts): RLS بترجع "لا شيء" بصمت عند الرفض وده UX سيئة.
-- ============================================================================

-- ============================================================
-- 1) prospect_import_batches — دفعة استيراد ملف Excel/CSV واحد
-- ============================================================
create table if not exists public.prospect_import_batches (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  file_type text not null check (file_type in ('xlsx', 'csv')),
  imported_by uuid references public.profiles(id) on delete set null,
  column_mapping jsonb not null default '{}'::jsonb,
  total_rows int not null default 0,
  imported_rows int not null default 0,
  duplicate_rows int not null default 0,
  rejected_rows int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_prospect_import_batches_imported_by
  on public.prospect_import_batches(imported_by);

-- ============================================================
-- 2) prospects — الجهة المستهدفة
-- ============================================================
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid references public.prospect_import_batches(id) on delete set null,

  organization_name text not null,
  normalized_name text, -- lower/trim لأغراض كشف التكرار بالاسم فقط، لا يُعرض
  sector text,
  governorate text,
  city_or_area text,
  branches_count int,
  scope_notes text, -- نطاق النشاط/التعليم (عمود واحد بدل عمودين منفصلين حسب القرار)

  primary_phone_raw text,
  primary_phone_normalized text, -- 201XXXXXXXXX بدون + — نص دائمًا، لا يُعامل كرقم
  secondary_phones jsonb not null default '[]'::jsonb,
  email text,
  website_url text,
  social_url text,
  source_urls jsonb not null default '[]'::jsonb,

  visible_size_evidence text,
  activity_signal text,
  pain_hypothesis text,
  suggested_offer text,
  research_score numeric,

  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'invalid_phone')),
  status text not null default 'new'
    check (status in (
      'new', 'needs_verification', 'ready_to_contact', 'contacted',
      'replied', 'interested', 'follow_up', 'not_fit', 'converted', 'archived'
    )),

  assigned_to uuid references public.profiles(id) on delete set null,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,

  converted_lead_id uuid references public.leads(id) on delete set null,
  converted_at timestamptz,

  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_prospects_status on public.prospects(status);
create index if not exists idx_prospects_assigned_to on public.prospects(assigned_to);
create index if not exists idx_prospects_next_follow_up on public.prospects(next_follow_up_at);
create index if not exists idx_prospects_phone on public.prospects(primary_phone_normalized);
create index if not exists idx_prospects_email on public.prospects(email);
create index if not exists idx_prospects_import_batch on public.prospects(import_batch_id);
create index if not exists idx_prospects_governorate on public.prospects(governorate);
create index if not exists idx_prospects_archived_at on public.prospects(archived_at);
create index if not exists idx_prospects_converted_lead on public.prospects(converted_lead_id);

create or replace function public.touch_prospect_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_prospect_update_touch on public.prospects;
create trigger on_prospect_update_touch
  before update on public.prospects
  for each row execute procedure public.touch_prospect_updated_at();

-- ============================================================
-- 3) prospect_activities — Timeline لكل جهة
-- ============================================================
create table if not exists public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'imported', 'verified', 'assigned', 'whatsapp_opened',
    'message_confirmed_sent', 'no_answer', 'replied', 'interested',
    'follow_up_scheduled', 'not_fit', 'converted_to_lead', 'note_added', 'archived'
  )),
  previous_status text,
  new_status text,
  channel text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prospect_activities_prospect
  on public.prospect_activities(prospect_id, created_at desc);

-- ============================================================
-- 4) prospect_message_templates — قوالب رسائل WhatsApp (بدون API)
-- ============================================================
create table if not exists public.prospect_message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_type text not null check (template_type in (
    'first_contact', 'no_reply_follow_up', 'meeting_booking'
  )),
  body text not null,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prospect_message_templates_type
  on public.prospect_message_templates(template_type);

drop trigger if exists on_prospect_template_update_touch on public.prospect_message_templates;
create trigger on_prospect_template_update_touch
  before update on public.prospect_message_templates
  for each row execute procedure public.touch_prospect_updated_at();

-- Seed: القوالب الافتراضية الثلاثة (is_default = true). placeholders:
-- {{organization_name}}, {{sender_name}}, {{pain_hypothesis}}, {{meeting_datetime}}
-- يتم استبدالها في lib/prospecting/whatsapp.ts::renderTemplate (مع escaping دفاعي).
insert into public.prospect_message_templates (name, template_type, body, is_default)
select 'أول تواصل', 'first_contact',
$body$السلام عليكم، أستاذ/أستاذة المسؤول عن {{organization_name}}.
مع حضرتك {{sender_name}} من NEXVORA.
من خلال مراجعتنا المبدئية لنشاط {{organization_name}} لاحظنا فرصة لتحسين {{pain_hypothesis}}.
نحن نساعد أصحاب الأنشطة على فهم احتياج النظام بدقة، وتحديد الـMVP، وتجهيز Prototype وحزمة متطلبات واضحة قبل بدء البرمجة.
نقدم جلسة اكتشاف وتحليلًا أوليًا مجانًا دون التزام، حتى تتأكدوا أننا فهمنا طريقة العمل والمشكلة فعلًا.
هل يناسب حضرتك مكالمة قصيرة لمدة 20–30 دقيقة هذا الأسبوع؟$body$,
  true
where not exists (
  select 1 from public.prospect_message_templates where template_type = 'first_contact' and is_default = true
);

insert into public.prospect_message_templates (name, template_type, body, is_default)
select 'عدم الرد', 'no_reply_follow_up',
$body$السلام عليكم، حضرتك.
كنت تواصلت معكم بخصوص جلسة اكتشاف مجانية لـ{{organization_name}} بهدف فهم طريقة التشغيل وتقديم تصور أولي للتحسين دون التزام.
أحببت فقط التأكد أن الرسالة وصلت، وإذا كان الوقت غير مناسب يمكنني التواصل في موعد آخر.$body$,
  true
where not exists (
  select 1 from public.prospect_message_templates where template_type = 'no_reply_follow_up' and is_default = true
);

insert into public.prospect_message_templates (name, template_type, body, is_default)
select 'حجز الاجتماع', 'meeting_booking',
$body$شكرًا لحضرتك.
لتأكيد جلسة اكتشاف مشروع {{organization_name}}، الموعد المقترح هو {{meeting_datetime}}، ومدتها نحو 30 دقيقة.
سنناقش طريقة العمل الحالية، أكثر المشكلات تأثيرًا، وما إذا كان الحل التقني مناسبًا فعلًا قبل الدخول في أي تكلفة برمجية.$body$,
  true
where not exists (
  select 1 from public.prospect_message_templates where template_type = 'meeting_booking' and is_default = true
);

-- ============================================================
-- Row Level Security — نفس نمط 0001: أي مستخدم مسجّل دخول مسموح له
-- بالقراءة/الكتابة على مستوى RLS؛ منع الأدوار الفعلي في Server Actions.
-- ============================================================
alter table public.prospect_import_batches enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_activities enable row level security;
alter table public.prospect_message_templates enable row level security;

create policy "internal_read_prospect_import_batches" on public.prospect_import_batches
  for select using (auth.uid() is not null);
create policy "internal_write_prospect_import_batches" on public.prospect_import_batches
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prospects" on public.prospects
  for select using (auth.uid() is not null);
create policy "internal_write_prospects" on public.prospects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prospect_activities" on public.prospect_activities
  for select using (auth.uid() is not null);
create policy "internal_write_prospect_activities" on public.prospect_activities
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prospect_message_templates" on public.prospect_message_templates
  for select using (auth.uid() is not null);
create policy "internal_write_prospect_message_templates" on public.prospect_message_templates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
