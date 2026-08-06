-- ============================================================
-- PM Operating System — 0021 Public Discovery Portal
-- روابط عامة (بلا تسجيل دخول) لتعبئة نموذج الاكتشاف من العميل مباشرة.
--
-- آمن للتشغيل أكثر من مرة (idempotent). شغّله كامل في Supabase SQL Editor.
-- إضافي بحت: لا يلمس أي جدول قائم ولا يكسر أي workflow.
--
-- ملاحظة تشغيل: البوابة العامة تستخدم Service Role Client (زي widget/share
-- الحاليين) — تأكد أن SUPABASE_SERVICE_ROLE_KEY مضبوط في متغيّرات البيئة
-- على Vercel (ومحليًا في .env.local لو هتشغّل البوابة محليًا).
-- ============================================================

-- ============================================================
-- 1) discovery_form_links — رابط عام واحد لكل مشروع (يُدوَّر عند إعادة الإنشاء)
-- ============================================================
create table if not exists public.discovery_form_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  template_id uuid references public.discovery_form_templates(id) on delete set null,
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'opened', 'in_progress', 'submitted', 'expired', 'cancelled')),
  expires_at timestamptz,               -- null = بلا انتهاء (Never)
  opened_at timestamptz,
  submitted_at timestamptz,
  last_activity_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discovery_links_token on public.discovery_form_links(token);
create index if not exists idx_discovery_links_status on public.discovery_form_links(status);

-- ============================================================
-- 2) RLS — إدارة الروابط من الداشبورد بواسطة المستخدمين الداخليين.
--    الوصول العام يتم عبر Service Role Client (يتجاوز RLS) زي باقي
--    الروابط العامة في النظام — مفيش سياسة عامة مقصودة.
-- ============================================================
alter table public.discovery_form_links enable row level security;

drop policy if exists "internal_read_discovery_links" on public.discovery_form_links;
create policy "internal_read_discovery_links" on public.discovery_form_links
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_discovery_links" on public.discovery_form_links;
create policy "internal_write_discovery_links" on public.discovery_form_links
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 3) updated_at تلقائي (نفس دالة touch_updated_at من migration 0020)
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_discovery_links_touch on public.discovery_form_links;
create trigger on_discovery_links_touch
  before update on public.discovery_form_links
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- انتهى 0021 Public Discovery Portal
-- ============================================================
