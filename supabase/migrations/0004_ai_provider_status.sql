-- ============================================================
-- Phase 2 — AI Provider Layer: حالة الاتصال بكل Provider
-- تُستخدم في صفحة الإعدادات (API Status + زر Test Connection).
-- إضافة بحتة، لا تلمس أي جدول موجود.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

create table if not exists public.ai_provider_status (
  provider text primary key,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_message text
);

alter table public.ai_provider_status enable row level security;

create policy "internal_read_ai_provider_status" on public.ai_provider_status
  for select using (auth.uid() is not null);
create policy "internal_write_ai_provider_status" on public.ai_provider_status
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
