-- ============================================================================
-- 0117 — مساعد المشروع (Project Assistant) — أساس قاعدة البيانات
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- الميزة: طبقة معرفة أفقية فوق المشروع كله (مش مرحلة سير عمل) — بتسمح لأي
-- مستخدم مصرَّح له يسأل سؤالًا ويحصل على إجابة مبنية على أدلة من "الحقيقة
-- الحالية" للمشروع (current truth)، مع استشهادات (citations) واضحة.
--
-- هذه المرحلة (Phase A من 4) بتبني الأساس فقط:
--   • توسيع knowledge_memory (0078) — إعادة استخدام لا تكرار — بأعمدة
--     تصنيف/سرّية/إصدار/استبدال لازمة للترتيب حسب "الحقيقة الحالية"
--     والاسترجاع المراعي للصلاحيات (Phase B).
--   • جداول محادثة مساعد المشروع (conversations/messages/message_sources).
--
-- **آمن على البيانات:** الأعمدة الجديدة كلها nullable أو بقيمة افتراضية
-- محايدة — صفر أثر على أي صف موجود أو أي قارئ/كاتب حالي لـ knowledge_memory.
-- القارئ/الكاتب الوحيد الحالي: lib/knowledge-hub/memory-service.ts
-- (object_type يستخدم فقط: entity/business_rule/requirement/decision/risk —
-- مفيش استخدام للأعمدة الجديدة، فمفيش كسر).
--
-- single-tenant بالكامل — لا يوجد عمود workspace_id (نفس نمط 0001/0113/
-- 0115/0116). RLS هنا: قراءة/كتابة لأي مستخدم مسجّل دخول على مستوى RLS؛
-- المنع الفعلي حسب الدور في Server Actions (lib/auth/rbac.ts::requireRole).
-- ============================================================================


-- ============================================================
-- ١) توسيع knowledge_memory — قيد object_type أوسع
--
-- الأنواع الموجودة (entity/business_rule/workflow/requirement/decision/
-- risk/item) باقية كما هي (توافق خلفي كامل مع lib/knowledge-hub). الأنواع
-- الجديدة تخص مصادر مساعد المشروع فقط.
-- ============================================================

-- بنلاقي اسم الـ check constraint الفعلي على object_type ونشيله ديناميكيًا
-- (بدل افتراض اسمه الافتراضي) — أأمن لو الاسم اختلف بين بيئات.
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
  check (object_type in (
    -- الأنواع الأصلية (0078) — لا تُمس
    'entity', 'business_rule', 'workflow', 'requirement', 'decision', 'risk', 'item',
    -- مصادر مساعد المشروع (0117)
    'discovery', 'meeting', 'brain', 'persona', 'user_flow',
    'user_story', 'acceptance_criteria', 'evidence',
    'prd_section', 'evaluation_scenario', 'prototype_review',
    'client_approval', 'handoff_item', 'commercial', 'task',
    'open_question', 'system_message'
  ));


-- ============================================================
-- ٢) أعمدة جديدة على knowledge_memory — كلها nullable/بقيمة افتراضية
--    محايدة، صفر أثر على الصفوف الحالية.
-- ============================================================

alter table public.knowledge_memory
  -- تسمية عرض منفصلة عن title الخام (تفضّل title لو فاضية).
  add column if not exists source_title text,

  -- طبيعة المعلومة — نفس اتحاد InformationClassification في
  -- lib/market-research/types.ts حرفيًا (fact/inference/assumption/
  -- hypothesis/decision + القيم القديمة legacy/needs_review/verified).
  add column if not exists classification text,

  -- مستوى السرّية — نفس اتحاد Confidentiality حرفيًا. افتراضي 'internal'
  -- (أبدًا 'public' بصمت) — المصادر اللي مالهاش تتبّع سرّية بتاخد internal.
  add column if not exists confidentiality text not null default 'internal',

  -- حالة المصدر وقت الفهرسة (نص حر — تتفاوت جدًا حسب نوع المصدر).
  add column if not exists status text,

  -- إصدار المصدر (لو له رقم إصدار، زي PRD).
  add column if not exists version integer,

  -- هل هذا الصف يمثّل أحدث لقطة معروفة لهذا الكائن؟
  add column if not exists is_current boolean not null default true,
  add column if not exists is_superseded boolean not null default false,

  -- يشاور للصف الأحدث اللي استبدل هذا (لو معروف).
  add column if not exists superseded_by uuid references public.knowledge_memory(id) on delete set null,

  -- حقيبة مرنة لأي بيانات خاصة بالمصدر (روابط flow/story، رقم قسم، ...).
  add column if not exists metadata jsonb not null default '{}'::jsonb,

  -- لحظة توليد هذه اللقطة تحديدًا (منفصلة عن updated_at العام).
  add column if not exists indexed_at timestamptz not null default now();

alter table public.knowledge_memory
  add constraint knowledge_memory_confidentiality_check
  check (confidentiality in ('public', 'internal', 'confidential'));

alter table public.knowledge_memory
  add constraint knowledge_memory_classification_check
  check (classification is null or classification in (
    'unclassified', 'legacy', 'needs_review', 'verified',
    'fact', 'inference', 'assumption', 'hypothesis', 'decision'
  ));

-- فهرس استرجاع (Phase B): تصفية سريعة على "الحقيقة الحالية" فقط.
create index if not exists idx_knowledge_memory_current
  on public.knowledge_memory (project_id, is_current);


-- ============================================================
-- ٣) جداول محادثة مساعد المشروع — محادثة ← رسائل ← مصادر لكل رسالة
-- ============================================================

create table if not exists public.project_assistant_conversations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,

  title         text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_project_assistant_conversations_project
  on public.project_assistant_conversations (project_id);
create index if not exists idx_project_assistant_conversations_user
  on public.project_assistant_conversations (user_id);

drop trigger if exists on_project_assistant_conversation_touch on public.project_assistant_conversations;
create trigger on_project_assistant_conversation_touch
  before update on public.project_assistant_conversations
  for each row execute procedure public.touch_updated_at();


create table if not exists public.project_assistant_messages (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid not null references public.project_assistant_conversations(id) on delete cascade,

  role                  text not null check (role in ('user', 'assistant')),
  content               text not null,

  -- حالة الإجابة — null لرسائل role='user'. القيم دي بتتطابق 1:1 مع
  -- تسميات الواجهة: معتمد/موثّق/غير محسوم/غير موجود — لا تُغيَّر.
  answer_status         text check (answer_status in ('approved', 'documented', 'unresolved', 'not_found')),

  -- بنية "اسأل في السياق" (قسم 17 من المواصفة) — nullable، لنقاط دخول
  -- مستقبلية "اسأل عن هذا" جوّه أي تبويب. مش مستخدمة في Phase A.
  context_source_type  text,
  context_source_id    uuid,

  created_at            timestamptz not null default now()
);

create index if not exists idx_project_assistant_messages_conversation
  on public.project_assistant_messages (conversation_id);


create table if not exists public.project_assistant_message_sources (
  id                  uuid primary key default gen_random_uuid(),
  message_id          uuid not null references public.project_assistant_messages(id) on delete cascade,

  -- مرجع اختياري لصف الذاكرة الدلالية الحيّ (لو لسه موجود).
  knowledge_memory_id uuid references public.knowledge_memory(id) on delete set null,

  -- لقطة مُنسَّخة (denormalized) عشان الاستشهاد يفضل له معنى حتى لو
  -- knowledge_memory_id اتمسح/اتستبدل/اتعاد فهرسته بعدين.
  source_type         text not null,
  source_id           uuid not null,
  source_title        text not null default '',
  similarity          real,

  created_at          timestamptz not null default now()
);

create index if not exists idx_project_assistant_message_sources_message
  on public.project_assistant_message_sources (message_id);


-- ============================================================
-- ٤) أمان مستوى الصف — نفس نمط 0001/0113/0115/0116: أي مستخدم مسجّل
-- دخول مسموح له على مستوى RLS، المنع الفعلي حسب الدور في Server Actions.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'project_assistant_conversations',
    'project_assistant_messages',
    'project_assistant_message_sources'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format(
      'create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t
    );
    execute format('drop policy if exists %I_auth_write on public.%I', t, t);
    execute format(
      'create policy %I_auth_write on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;
