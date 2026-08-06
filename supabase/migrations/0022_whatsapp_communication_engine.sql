-- ============================================================
-- PM Operating System — 0022 WhatsApp Communication Engine
--
-- طبقة WhatsApp Provider Layer + قوالب رسائل + سجل الرسائل +
-- إعدادات + إحصائيات على روابط الاكتشاف. إضافي بحت، آمن للتشغيل
-- المتكرر (idempotent). لا يعدّل أي جدول قائم بما يكسر السلوك الحالي.
--
-- متغيّرات البيئة اللازمة (Vercel):
--   WHATSAPP_PROVIDER            = meta_cloud | twilio | noop
--   WHATSAPP_META_ACCESS_TOKEN   (لو meta_cloud)
--   WHATSAPP_META_PHONE_NUMBER_ID
--   WHATSAPP_META_VERIFY_TOKEN
--   WHATSAPP_META_APP_SECRET     (للتحقق من توقيع الـ webhook)
--   WHATSAPP_TWILIO_ACCOUNT_SID  (لو twilio)
--   WHATSAPP_TWILIO_AUTH_TOKEN
--   WHATSAPP_TWILIO_FROM
--   CRON_SECRET                  (لتأمين /api/cron/whatsapp-reminders)
-- ============================================================

-- ============================================================
-- 1) whatsapp_settings — صف واحد (scope='global')
-- ============================================================
create table if not exists public.whatsapp_settings (
  scope text primary key default 'global',
  provider text not null default 'noop'
    check (provider in ('noop', 'meta_cloud', 'twilio', 'ultramsg', 'green_api', '360dialog')),
  default_country text not null default 'EG',           -- ISO alpha-2 لتعبئة رقم بلا كود بلد
  default_link_expiration_days int,                     -- null = بلا انتهاء
  reminders_enabled boolean not null default true,
  reminder_max_count int not null default 2,
  reminder_interval_hours int not null default 48,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.whatsapp_settings (scope) values ('global')
on conflict (scope) do nothing;

-- ============================================================
-- 2) whatsapp_provider_status — نتيجة آخر Health Check
-- ============================================================
create table if not exists public.whatsapp_provider_status (
  provider text primary key,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_message text
);

-- ============================================================
-- 3) whatsapp_templates — قوالب الرسائل، النص خارج الكود
--    variables jsonb = ["customer_name","project_name",...]
-- ============================================================
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  purpose text not null
    check (purpose in ('discovery_invitation', 'reminder_before_open', 'reminder_before_completion', 'thank_you', 'manual')),
  body text not null,
  language text not null default 'ar',
  variables jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_whatsapp_templates_purpose on public.whatsapp_templates(purpose);

-- ============================================================
-- 4) whatsapp_messages — سجل كل رسالة صادرة/واردة
-- ============================================================
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  link_id uuid references public.discovery_form_links(id) on delete set null,

  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  phone text not null,                                  -- E.164
  purpose text not null                                 -- نفس قيم whatsapp_templates.purpose
    check (purpose in ('discovery_invitation', 'reminder_before_open', 'reminder_before_completion', 'thank_you', 'manual')),
  template_key text,                                    -- المفتاح المستخدم وقت الإرسال
  body text not null,                                   -- النص النهائي بعد استبدال المتغيّرات
  reminder_index int not null default 0,                -- 0 = رسالة أولى، 1..n = تذكير

  provider text not null,
  provider_message_id text,                             -- للربط مع الـ webhook
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','failed','received')),
  error_code text,
  error_message text,

  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,

  retry_count int not null default 0,
  acknowledged_at timestamptz,                          -- لتصريف إشعار الفشل من الجرس

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_messages_project on public.whatsapp_messages(project_id, created_at desc);
create index if not exists idx_wa_messages_link on public.whatsapp_messages(link_id);
create index if not exists idx_wa_messages_status on public.whatsapp_messages(status);
create index if not exists idx_wa_messages_provider_msgid on public.whatsapp_messages(provider_message_id);

-- ============================================================
-- 5) whatsapp_requests_log — سجل observability لكل محاولة إرسال
--    (مواز لـ ai_requests_log، بدون أي محتوى للرسالة)
-- ============================================================
create table if not exists public.whatsapp_requests_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  message_id uuid references public.whatsapp_messages(id) on delete set null,
  provider text not null,
  purpose text not null,
  success boolean not null,
  latency_ms int,
  error_code text,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_reqlog_project on public.whatsapp_requests_log(project_id, created_at desc);

-- ============================================================
-- 6) إضافات إحصائيات على discovery_form_links (Link Analytics)
-- ============================================================
alter table public.discovery_form_links
  add column if not exists first_open_at timestamptz,
  add column if not exists visit_count int not null default 0,
  add column if not exists last_country text,
  add column if not exists last_device text,
  add column if not exists last_browser text,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count int not null default 0;

-- ============================================================
-- 7) RLS — إدارة داخلية فقط. البوابة العامة والـ webhook يستخدمون
--    Service Role Client الذي يتجاوز RLS (نفس النمط في المشروع).
-- ============================================================
alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_provider_status enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_requests_log enable row level security;

drop policy if exists "internal_read_wa_settings" on public.whatsapp_settings;
create policy "internal_read_wa_settings" on public.whatsapp_settings
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_wa_settings" on public.whatsapp_settings;
create policy "internal_write_wa_settings" on public.whatsapp_settings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_wa_status" on public.whatsapp_provider_status;
create policy "internal_read_wa_status" on public.whatsapp_provider_status
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_wa_status" on public.whatsapp_provider_status;
create policy "internal_write_wa_status" on public.whatsapp_provider_status
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_wa_templates" on public.whatsapp_templates;
create policy "internal_read_wa_templates" on public.whatsapp_templates
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_wa_templates" on public.whatsapp_templates;
create policy "internal_write_wa_templates" on public.whatsapp_templates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_wa_messages" on public.whatsapp_messages;
create policy "internal_read_wa_messages" on public.whatsapp_messages
  for select using (auth.uid() is not null);
drop policy if exists "internal_write_wa_messages" on public.whatsapp_messages;
create policy "internal_write_wa_messages" on public.whatsapp_messages
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_wa_reqlog" on public.whatsapp_requests_log;
create policy "internal_read_wa_reqlog" on public.whatsapp_requests_log
  for select using (auth.uid() is not null);

-- ============================================================
-- 8) updated_at triggers (نفس دالة touch_updated_at من 0020)
-- ============================================================
drop trigger if exists on_whatsapp_settings_touch on public.whatsapp_settings;
create trigger on_whatsapp_settings_touch
  before update on public.whatsapp_settings
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_whatsapp_templates_touch on public.whatsapp_templates;
create trigger on_whatsapp_templates_touch
  before update on public.whatsapp_templates
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_whatsapp_messages_touch on public.whatsapp_messages;
create trigger on_whatsapp_messages_touch
  before update on public.whatsapp_messages
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 9) Seed القوالب الافتراضية (مرة واحدة، لا تُدهس لو الأدمن عدّلها)
-- ============================================================
insert into public.whatsapp_templates (key, name, purpose, body, is_default, variables)
values
  (
    'discovery_invitation_default',
    'دعوة تعبئة نموذج الاكتشاف',
    'discovery_invitation',
    E'مرحباً {{customer_name}}،\n\nشكراً لاختيارك VELORA لتنفيذ مشروع «{{project_name}}».\n\nعشان نفهم مشروعك بأفضل صورة، جهّزنا لك نموذج قصير هيساعدنا نبدأ التحليل صح — بيستغرق تقريباً 8 إلى 12 دقيقة، وتقدر تقف وترجع تكمّل في أي وقت من نفس الرابط.\n\n👇 ابدأ من هنا:\n{{discovery_link}}\n\n{{expiration_line}}\n\nأي استفسار، احنا موجودين.\nفريق VELORA',
    true,
    '["customer_name","project_name","company_name","discovery_link","expiration_date","expiration_line"]'::jsonb
  ),
  (
    'reminder_before_open_default',
    'تذكير — قبل فتح النموذج',
    'reminder_before_open',
    E'مرحباً {{customer_name}}،\n\nحبّينا نذكّرك بنموذج الاكتشاف الخاص بمشروع «{{project_name}}» — لسه ما فتحتوش، وهو خطوة مهمة عشان نبدأ.\n\nالرابط:\n{{discovery_link}}\n\n{{expiration_line}}\n\nفريق VELORA',
    true,
    '["customer_name","project_name","discovery_link","expiration_date","expiration_line"]'::jsonb
  ),
  (
    'reminder_before_completion_default',
    'تذكير — بعد بدء التعبئة',
    'reminder_before_completion',
    E'مرحباً {{customer_name}}،\n\nشكراً إنك بدأت في نموذج مشروع «{{project_name}}» — لسه محتاجين نكمّله عشان يبدأ الفريق التحليل.\n\nكمّل من هنا (إجاباتك محفوظة):\n{{discovery_link}}\n\n{{expiration_line}}\n\nفريق VELORA',
    true,
    '["customer_name","project_name","discovery_link","expiration_date","expiration_line"]'::jsonb
  ),
  (
    'thank_you_default',
    'شكر — بعد تسليم النموذج',
    'thank_you',
    E'شكراً جزيلاً {{customer_name}} 🌿\n\nاستلمنا بيانات مشروع «{{project_name}}» وبدأ فريق VELORA تحليلها. هنتواصل معك قريباً بالخطوات التالية.\n\nفريق VELORA',
    true,
    '["customer_name","project_name"]'::jsonb
  )
on conflict (key) do nothing;

-- ============================================================
-- انتهى 0022 WhatsApp Communication Engine
-- ============================================================
