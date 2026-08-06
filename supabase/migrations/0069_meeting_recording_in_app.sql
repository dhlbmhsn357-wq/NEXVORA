-- ============================================================
-- 0069 — تسجيل الاجتماع داخل المنصة (In-App Meeting Recording)
--
-- المشكلة: bucket 'meetings' اتعمل في 0006 بدون أي سياسة RLS على
-- storage.objects، فكان الرفع/القراءة ممكن من service_role بس (مسار
-- Telegram). دلوقتي المتصفح بيرفع التسجيل مباشرة لـ Storage (عشان
-- يتخطّى حد حجم الطلب في Serverless)، فمحتاج سياسات صريحة.
--
-- إضافي فقط (additive) — مفيش أي تعديل على جداول أو بيانات قائمة.
-- ============================================================

-- تأكيد وجود الـ bucket (لو المشروع اتعمل قبل 0006 لأي سبب)
insert into storage.buckets (id, name, public)
values ('meetings', 'meetings', false)
on conflict (id) do nothing;

-- service_role: صلاحية كاملة (الـ Pipeline بينزّل الملف للتفريغ)
drop policy if exists "service_role_all_meetings_storage" on storage.objects;
create policy "service_role_all_meetings_storage" on storage.objects
  for all to service_role
  using (bucket_id = 'meetings')
  with check (bucket_id = 'meetings');

-- المستخدمون المسجّلون: رفع وقراءة تسجيلات الاجتماعات من داخل المنصة.
-- الـ bucket private، فمفيش أي وصول عام — لازم جلسة مصادقة صالحة.
drop policy if exists "meetings_recordings_auth_all" on storage.objects;
create policy "meetings_recordings_auth_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'meetings')
  with check (bucket_id = 'meetings');

-- ============================================================
-- تتبّع مصدر التسجيل — للتفرقة بين تسجيل داخل المنصة ورفع Telegram
-- ============================================================
alter table public.meetings
  add column if not exists recording_source text
    check (recording_source in ('telegram', 'in_app'));

comment on column public.meetings.recording_source is
  'مصدر التسجيل: in_app = اتسجّل داخل المنصة من Live Meeting Mode، telegram = اترفع عبر البوت. NULL للاجتماعات الأقدم.';
