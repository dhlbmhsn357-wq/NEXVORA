-- ============================================================================
-- 0118 — مساعد المشروع (Project Assistant) — دالة الاسترجاع (Phase B)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- بيضيف دالة استرجاع جديدة **بجانب** `match_knowledge_memory` (0078) مش
-- بدلًا منها — القارئ الحالي الوحيد لـ match_knowledge_memory هو
-- lib/knowledge-hub/memory-service.ts، وده لازم يفضل شغّال بالظبط زي ما هو.
--
-- الفرق الجوهري عن match_knowledge_memory:
--   • تصفية `is_current = true` داخل SQL (مش post-filter في JS) — عشان
--     `limit match_count` يفضل معناه صحيح: لو فلترنا بعد الاسترجاع في
--     التطبيق، ممكن نرجّع أقل من match_count نتيجة فعليًا ذات صلة حتى لو
--     كانت موجودة في القاعدة.
--   • `p_exclude_confidential` — البوابة الخادمية الصلبة لصلاحيات
--     الاسترجاع (member ما يشوفش confidentiality='confidential' أبدًا).
--     دي المرة الأولى اللي السرّية بتتفلتر SQL-side — enforcement حقيقي
--     مش تعليمة Prompt.
--   • `p_object_types` — فلتر اختياري لنطاق من الأنواع (مفيد لـ "اسأل في
--     السياق" المستقبلي).
--   • بترجّع أعمدة "الحقيقة الحالية" الإضافية (classification/
--     confidentiality/status/version/is_superseded/superseded_by/metadata)
--     عشان طبقة الترتيب (current-truth ranking) في التطبيق تقدر تحسب
--     أولوية كل نتيجة من غير أي استعلام إضافي.
-- ============================================================================

create or replace function public.match_project_assistant_knowledge(
  p_project_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_exclude_confidential boolean default false,
  p_object_types text[] default null
)
returns table (
  id              uuid,
  object_type     text,
  object_id       uuid,
  title           text,
  source_title    text,
  content         text,
  domain          text,
  classification  text,
  confidentiality text,
  status          text,
  version         integer,
  is_current      boolean,
  is_superseded   boolean,
  superseded_by   uuid,
  metadata        jsonb,
  similarity      float
)
language sql stable as $$
  select
    m.id, m.object_type, m.object_id, m.title, m.source_title, m.content,
    m.domain, m.classification, m.confidentiality, m.status, m.version,
    m.is_current, m.is_superseded, m.superseded_by, m.metadata,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.knowledge_memory m
  where m.project_id = p_project_id
    and m.embedding is not null
    and m.is_current = true
    and (not p_exclude_confidential or m.confidentiality is distinct from 'confidential')
    and (p_object_types is null or m.object_type = any(p_object_types))
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_project_assistant_knowledge(
  uuid, vector, float, int, boolean, text[]
) to service_role, authenticated;
