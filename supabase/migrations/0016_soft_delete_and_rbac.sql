-- ============================================================
-- Post-Audit Hardening — Critical Fixes
-- 1) Soft Delete/Archive على الكيانات الأساسية (leads/projects/meetings)
--    — يمنع فقدان البيانات بلا رجعة ويلغي داعي حذف مباشر من Supabase
-- 2) جدول rate_limit_hits لحماية المسارات العامة (Widget/Webhook)
-- 3) توثيق إن أعمدة role موجودة وستُفعّل في طبقة التطبيق
--    (السياسات تفضل كما هي حاليًا؛ الـ Enforcement في Server Actions/API)
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) archived_at — Soft Delete عام لكل كيان قابل للأرشفة
-- ============================================================
alter table public.leads       add column if not exists archived_at timestamptz;
alter table public.projects    add column if not exists archived_at timestamptz;
alter table public.meetings    add column if not exists archived_at timestamptz;

create index if not exists idx_leads_archived    on public.leads(archived_at) where archived_at is null;
create index if not exists idx_projects_archived on public.projects(archived_at) where archived_at is null;
create index if not exists idx_meetings_archived on public.meetings(archived_at) where archived_at is null;

-- ============================================================
-- 2) فهرس فريد يمنع تحويل نفس Lead لمشروع أكثر من مرة
-- (طبقة دفاع ثانية بجانب فحص التطبيق نفسه)
-- ============================================================
create unique index if not exists idx_projects_lead_unique
  on public.projects(lead_id)
  where lead_id is not null;

-- ============================================================
-- 3) rate_limit_hits — سقف طلبات بسيط للمسارات العامة
-- ============================================================
create table if not exists public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,               -- مثال: 'support_chat'
  identifier text not null,          -- widget_key أو IP
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_lookup
  on public.rate_limit_hits(scope, identifier, created_at desc);

-- تنظيف تلقائي: احذف الطلبات الأقدم من 24 ساعة عند كل insert
-- (بأسلوب "مقاطعة نادرة" — لو مش عايز trigger، شيله ونظّف بجدولة يدوية)
create or replace function public.cleanup_old_rate_limit_hits()
returns trigger
language plpgsql
as $$
begin
  delete from public.rate_limit_hits
  where created_at < now() - interval '24 hours';
  return new;
end;
$$;

-- تشغيل التنظيف عشوائيًا (كل ~50 insert تقريبًا) بدل كل مرة عشان مايبطّئش
create or replace function public.maybe_cleanup_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if random() < 0.02 then
    delete from public.rate_limit_hits
    where created_at < now() - interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists on_rate_limit_insert_cleanup on public.rate_limit_hits;
create trigger on_rate_limit_insert_cleanup
  after insert on public.rate_limit_hits
  for each row execute procedure public.maybe_cleanup_rate_limit();

alter table public.rate_limit_hits enable row level security;

-- كتابة من Service Role فقط (الـ API routes)؛ قراءة داخلية للتشخيص
create policy "internal_read_rate_limit_hits" on public.rate_limit_hits
  for select using (auth.uid() is not null);

-- ============================================================
-- ملاحظة: أعمدة profiles.role موجودة من Phase 1، لكنها لم تكن مُطبَّقة.
-- من هذه المرحلة، حساس الأمان (Settings الحساسة، Archive) سيتحقق من role
-- في طبقة التطبيق (Server Actions) بدل تعديل RLS — لأن RLS تمنع بشكل صامت
-- والـ Server Action يمكنها إرجاع رسالة واضحة للمستخدم.
--
-- خطوة إلزامية بعد تشغيل هذا الملف: ارفع دور صاحب المنصة إلى owner
-- (استبدل الإيميل بإيميلك):
--   update public.profiles set role = 'owner'
--   where email = 'teachermohsenashraf@gmail.com';
-- بدون هذه الخطوة، لن يقدر أي مستخدم أن يغيّر إعدادات AI أو يعمل
-- أرشفة، لأن الجميع بيتخلقوا افتراضيًا كـ member.
-- ============================================================
