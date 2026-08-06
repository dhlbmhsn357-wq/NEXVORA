-- 0066_account_avatars.sql
-- مخزن صور الحسابات (Self-service profile — Enterprise IAM).
-- الرفع نفسه بيتم عبر service client (بيتخطى RLS)، فالسياسات هنا أساسًا
-- لتفعيل القراءة العامة للصور + سماح المستخدم يدير مجلده الخاص لو احتجنا
-- رفع من العميل مستقبلًا. Additive-only وآمن لإعادة التشغيل.

-- 1) إنشاء bucket عام باسم avatars (idempotent)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 2) قراءة عامة لصور الحسابات
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- 3) المستخدم المسجّل يقدر يرفع/يحدّث/يحذف صورته فقط (داخل مجلد باسم user id)
drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
