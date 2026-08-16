-- ============================================================
-- تراجع 0117 — مساعد المشروع (أساس قاعدة البيانات)
--
-- **اقرأ قبل التشغيل:**
--   • بيحذف جداول محادثة مساعد المشروع بالكامل (بيانات المحادثات
--     والاستشهادات — لو فيها بيانات حقيقية، اعمل نسخة احتياطية الأول).
--   • بيرجّع knowledge_memory.object_type لقيدها الأصلي (0078) —
--     هيفشل لو فيه صفوف بالأنواع الجديدة (discovery/meeting/...) لسه
--     موجودة؛ امسحها الأول أو سيبها لو مش بتخطط ترجع لقبل 0117.
--   • الأعمدة الجديدة (classification/confidentiality/...) بتتشال —
--     أي بيانات فيها بتتفقد.
-- ============================================================

alter table public.knowledge_memory
  drop constraint if exists knowledge_memory_confidentiality_check,
  drop constraint if exists knowledge_memory_classification_check;

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'knowledge_memory'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%object_type%'
  loop
    execute format('alter table public.knowledge_memory drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.knowledge_memory
  add constraint knowledge_memory_object_type_check
  check (object_type in ('entity','business_rule','workflow','requirement','decision','risk','item'));

drop index if exists public.idx_knowledge_memory_current;

alter table public.knowledge_memory
  drop column if exists source_title,
  drop column if exists classification,
  drop column if exists confidentiality,
  drop column if exists status,
  drop column if exists version,
  drop column if exists is_current,
  drop column if exists is_superseded,
  drop column if exists superseded_by,
  drop column if exists metadata,
  drop column if exists indexed_at;

drop table if exists public.project_assistant_message_sources;
drop table if exists public.project_assistant_messages;
drop table if exists public.project_assistant_conversations;
