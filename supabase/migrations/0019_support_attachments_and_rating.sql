-- ============================================================
-- Support — File Attachments + Satisfaction Rating
-- 1) Storage bucket خاص لصور المرفقات في محادثة الدعم
-- 2) عمود تقييم رضا العميل بعد إغلاق الطلب
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) Bucket خاص (مش Public) — الوصول بس عبر Signed URL من السيرفر
-- ============================================================
insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

do $$ begin
  create policy "service_role_all_support_attachments" on storage.objects
    for all
    using (bucket_id = 'support-attachments' and auth.role() = 'service_role')
    with check (bucket_id = 'support-attachments' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_read_support_attachments" on storage.objects
    for select
    using (bucket_id = 'support-attachments' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ============================================================
-- 2) تقييم رضا العميل — 1 = 👍، -1 = 👎، null = لسه ما اتقيّمش
-- ============================================================
alter table public.support_requests
  add column if not exists satisfaction_rating smallint
    check (satisfaction_rating in (-1, 1)),
  add column if not exists satisfaction_rated_at timestamptz;
