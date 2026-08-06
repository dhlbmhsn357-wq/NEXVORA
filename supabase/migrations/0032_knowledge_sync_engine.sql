-- Live Knowledge Synchronization Engine (Phase X، Prompt 2):
--  1) إعداد تفعيل/تعطيل المزامنة التلقائية للمشتقات (PRD, Prototype
--     Prompt, Client Presentation, Developer Handoff) عند تغيّر Project
--     Brain. افتراضيًا false — التوليد التلقائي المتتالي بيستهلك حصة AI
--     حقيقية، فمينفعش يتفعّل بصمت من غير ما الـ PM يختاره بوعي.
--  2) قيمة 'auto_resync' جديدة في أعمدة "reason" بتوع النسخ، عشان أي
--     نسخة اتولّدت بسبب مزامنة تلقائية (مش ضغطة PM يدوية) تتوسم بوضوح
--     في الـ Change Log.

alter table public.brain_settings
  add column if not exists auto_resync_downstream boolean not null default false;

-- الأعمدة الأصلية اتعرّفت بـ "reason text check (...)" بدون اسم صريح،
-- فبوستجريس بيسمّي الـ Constraint تلقائيًا — بدل ما نخمّن الاسم، بندوّر
-- عليه ديناميكيًا من pg_constraint ونشيله، عشان الإضافة تنجح مهما كان
-- الاسم الفعلي.
do $$
declare
  rec record;
begin
  for rec in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.prd_versions'::regclass,
        'public.prototype_prompt_versions'::regclass,
        'public.client_presentation_versions'::regclass,
        'public.developer_handoff_versions'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%reason%'
  loop
    execute format('alter table %s drop constraint %I', rec.tbl, rec.conname);
  end loop;
end $$;

alter table public.prd_versions
  add constraint prd_versions_reason_check
  check (reason in ('full_generation','partial_regeneration','manual_edit','conflict_replace','auto_resync'));

alter table public.prototype_prompt_versions
  add constraint prototype_prompt_versions_reason_check
  check (reason in ('full_generation','partial_regeneration','manual_edit','conflict_replace','auto_resync'));

alter table public.client_presentation_versions
  add constraint client_presentation_versions_reason_check
  check (reason in ('full_generation','partial_regeneration','manual_edit','auto_resync'));

alter table public.developer_handoff_versions
  add constraint developer_handoff_versions_reason_check
  check (reason in ('full_generation','manual_edit','status_change','auto_resync'));
