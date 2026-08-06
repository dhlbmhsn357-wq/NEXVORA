-- ============================================================
-- PM Operating System — 0051 AI Knowledge Pipeline & Knowledge Graph
-- (Phase 3)
--
-- إضافي بحت، idempotent. الطبقة دي "مُشتقّة" من Project Brain v2
-- الموجود أصلًا (19 قسم، Diff Viewer، Pending Changes) — مش بديلة له.
-- Brain v2 يفضل مصدر الحقيقة لمحتوى الأقسام؛ الجداول دي بتبني فوقه
-- فهرس أغنى (Node لكل عنصر، بثقة/دليل/نسخة/علاقات مستقلة لكل عنصر
-- بدل مستوى القسم كله). مفيش أي تعديل على project_brain_documents أو
-- brain_pending_changes أو brain_knowledge_graph_edges الموجودين.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

create extension if not exists vector;

-- ============================================================
-- 1) Domain Profile — منفصل عن project_type الموجود (website/mobile_app/
-- saas/dashboard/other)، ده تصنيف "مجال العمل" (ERP/CRM/...) مش "نوع
-- المنتج التقني".
-- ============================================================
alter table public.projects add column if not exists domain text
  check (domain in (
    'erp', 'crm', 'lms', 'healthcare', 'legal', 'construction', 'hospital',
    'ecommerce', 'restaurant', 'factory', 'clinic', 'school', 'warehouse',
    'accounting', 'generic'
  ));

-- ============================================================
-- 2) knowledge_nodes — عنصر معرفة واحد مستقل (مُشتق من عنصر داخل قسم
-- Brain v2 معتمد). item_key بيستخدم نفس منطق keyOfItem() الموجود في
-- lib/brain-v2/diff.ts — صفر منطق مطابقة مكرر.
-- ============================================================
create table if not exists public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null, -- = BrainSectionKey (business_rules, risks, ...)
  item_key text not null,
  title text not null,
  description text not null default '',
  source_type text not null default 'brain_section'
    check (source_type in ('brain_section', 'meeting', 'discovery', 'manual', 'attachment')),
  source_reference text,
  confidence_score int not null default 70 check (confidence_score >= 0 and confidence_score <= 100),
  importance text not null default 'medium' check (importance in ('critical', 'high', 'medium', 'low')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'active'
    check (status in ('active', 'needs_review', 'needs_regeneration', 'rejected', 'superseded')),
  version int not null default 1,
  superseded_by_id uuid references public.knowledge_nodes(id) on delete set null,
  previous_value jsonb,
  author_id uuid references public.profiles(id) on delete set null,
  ai_model text,
  embedding vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_nodes_project on public.knowledge_nodes(project_id, status);
create index if not exists idx_knowledge_nodes_category on public.knowledge_nodes(project_id, category);
-- عنصر Active واحد بس لكل (مشروع، قسم، مفتاح) — أي نسخة تانية لازم تتحوّل superseded الأول.
create unique index if not exists idx_knowledge_nodes_active_key
  on public.knowledge_nodes(project_id, category, item_key)
  where status = 'active';

-- ============================================================
-- 3) knowledge_evidence — دليل كل عنصر (من EvidenceRef الموجودة أصلًا
-- في عناصر Brain v2، زائد حقول مصدر إضافية مطلوبة في السياق الجديد).
-- ============================================================
create table if not exists public.knowledge_evidence (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  quote text not null default '',
  source_module text,
  source_meeting_id uuid references public.meetings(id) on delete set null,
  source_transcript_timestamp text,
  supporting_attachment_id uuid references public.meeting_attachments(id) on delete set null,
  supporting_note_id uuid,
  supporting_discovery_answer_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_evidence_node on public.knowledge_evidence(node_id);

-- ============================================================
-- 4) knowledge_relations — علاقات مكتوبة حقيقية بين عنصرين (بديل
-- brain_knowledge_graph_edges اللي هو سجل Provenance مسطّح "X أنتج Y"
-- بس، مفيش عليه لمسة هنا؛ الجدول ده جديد ومنفصل بالكامل).
-- ============================================================
create table if not exists public.knowledge_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  to_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  relation_type text not null default 'related_to'
    check (relation_type in ('depends_on', 'related_to', 'blocks', 'part_of', 'conflicts_with')),
  inferred_by text not null default 'manual' check (inferred_by in ('ai', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_relations_project on public.knowledge_relations(project_id);
create index if not exists idx_knowledge_relations_from on public.knowledge_relations(from_node_id);
create index if not exists idx_knowledge_relations_to on public.knowledge_relations(to_node_id);
create unique index if not exists idx_knowledge_relations_unique
  on public.knowledge_relations(from_node_id, to_node_id, relation_type);

-- ============================================================
-- 5) knowledge_versions — تاريخ كامل لكل نسخة عنصر (مفيش استبدال صامت
-- أبدًا — كل نسخة قديمة تفضل موجودة ومتاحة).
-- ============================================================
create table if not exists public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  change_reason text not null default '',
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_versions_node on public.knowledge_versions(node_id, version desc);

-- ============================================================
-- 6) knowledge_consistency_reports — نتيجة كل تشغيلة "تحليل شبكة
-- المعرفة" عند الطلب (On-Demand، مش تلقائي على كل تغيير).
-- ============================================================
create table if not exists public.knowledge_consistency_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'ready' check (status in ('generating', 'ready', 'failed')),
  issues jsonb not null default '[]'::jsonb,
  domain_gaps jsonb not null default '[]'::jsonb,
  relations_inferred_count int not null default 0,
  last_error text,
  requested_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);
create index if not exists idx_knowledge_consistency_project on public.knowledge_consistency_reports(project_id, generated_at desc);

-- ============================================================
-- 7) بحث دلالي داخل مشروع واحد — نفس نمط match_organizational_knowledge/
-- match_similar_projects الموجودين في 0041، بس مقصور على knowledge_nodes
-- لمشروع واحد بدل قاعدة المعرفة العابرة للمشاريع.
-- ============================================================
create or replace function public.match_project_knowledge(
  p_project_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  category text,
  title text,
  description text,
  confidence_score integer,
  status text,
  similarity float
)
language sql stable as $$
  select
    kn.id, kn.category, kn.title, kn.description, kn.confidence_score, kn.status,
    1 - (kn.embedding <=> query_embedding) as similarity
  from public.knowledge_nodes kn
  where kn.project_id = p_project_id
    and kn.status = 'active'
    and kn.embedding is not null
    and 1 - (kn.embedding <=> query_embedding) > match_threshold
  order by kn.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- 8) updated_at trigger (touch_updated_at دالة عامة موجودة أصلًا).
-- ============================================================
drop trigger if exists on_knowledge_nodes_touch on public.knowledge_nodes;
create trigger on_knowledge_nodes_touch before update on public.knowledge_nodes
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 9) RLS — نفس سياسة النظام لكل الجداول الجديدة.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'knowledge_nodes', 'knowledge_evidence', 'knowledge_relations',
    'knowledge_versions', 'knowledge_consistency_reports'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "internal_read_%s" on public.%I', t, t);
    execute format('create policy "internal_read_%s" on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists "internal_write_%s" on public.%I', t, t);
    execute format('create policy "internal_write_%s" on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
  end loop;
end $$;

-- ============================================================
-- 10) نوع مهمة AI جديد لتحليل شبكة المعرفة (استنتاج علاقات + فحوصات
-- تناسق تحتاج حكم لغوي، بجانب الفحوصات الحتمية المحسوبة بالكود).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('knowledge_graph_analysis', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- انتهى 0051
-- ============================================================
