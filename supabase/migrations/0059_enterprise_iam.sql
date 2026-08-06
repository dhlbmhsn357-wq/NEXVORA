-- 0059_enterprise_iam.sql
-- Enterprise IAM (المرحلة الأولى من التحول لنظام تشغيل داخلي):
--   1) profiles: حالة المستخدم + دور supervisor + آخر دخول + عدّاد فشل الدخول + قفل.
--   2) login_attempts: سجل محاولات الدخول (نجاح/فشل) لأغراض rate-limiting والقفل.
--   3) audit_log: توسعة قائمة الأحداث المسموحة بأحداث IAM.
-- ملاحظات:
--   - الأدوار تبقى superset متوافق مع القديم: owner (مسؤول النظام) > admin > supervisor (جديد) > member (منفّذ).
--   - لا حذف لأي عمود/جدول قائم — إضافات فقط (additive).
-- يُنفَّذ يدويًا في Supabase SQL Editor.

-- 1) profiles: الأعمدة الجديدة
alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists last_login_at timestamptz,
  add column if not exists failed_login_count int not null default 0,
  add column if not exists locked_at timestamptz;

-- حالة المستخدم: active | inactive | locked | suspended | pending | deleted
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active','inactive','locked','suspended','pending','deleted'));

-- الدور: إضافة supervisor (مشرف) بين admin و member
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner','admin','supervisor','member'));

-- كل المستخدمين الحاليين نشطون
update public.profiles set status = 'active' where status is null;

-- 2) login_attempts: سجل محاولات الدخول (يقرأه/يكتبه service role فقط)
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text,
  user_agent text,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_attempts_email_time
  on public.login_attempts (email, created_at desc);

-- RLS مفعّل بدون سياسات = ممنوع على anon/authenticated؛ service role يتجاوز RLS.
alter table public.login_attempts enable row level security;

-- 3) audit_log: توسعة الأحداث المسموحة بأحداث IAM
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check
  check (action in (
    'create','update','delete','stage_change',
    'login','logout','failed_login',
    'setup_completed','user_created','user_updated','user_deleted',
    'role_change','password_reset','password_changed','email_changed',
    'user_locked','user_unlocked','user_deactivated','user_reactivated','user_suspended'
  ));
