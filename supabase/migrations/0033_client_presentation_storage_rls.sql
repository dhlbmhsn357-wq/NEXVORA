-- ============================================================
-- إصلاح "Download PPTX Failed": الـ bucket "client-presentations"
-- اتعمل في 0013 بدون أي سياسة RLS على storage.objects — فأي محاولة
-- إنشاء Signed URL من جلسة مستخدم عادي كانت بترفض بصمت (مش الرفع،
-- لأن الرفع بيحصل عبر Service Role اللي بيتجاوز RLS أصلاً).
-- نفس نمط support-attachments (0019) وdiscovery uploads (0020) بالظبط.
-- ============================================================

do $$ begin
  create policy "service_role_all_client_presentations" on storage.objects
    for all
    using (bucket_id = 'client-presentations' and auth.role() = 'service_role')
    with check (bucket_id = 'client-presentations' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "internal_read_client_presentations_files" on storage.objects
    for select
    using (bucket_id = 'client-presentations' and auth.uid() is not null);
exception when duplicate_object then null; end $$;
