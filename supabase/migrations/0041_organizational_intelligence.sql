-- ============================================================
-- Organizational Intelligence & Continuous Learning Engine (Phase 6)
-- — المرحلة الأخيرة. طبقة مستقلة كليًا فوق كل المراحل السابقة، لا تعدّل
-- أي جدول قديم. الهدف: استخراج معرفة قابلة لإعادة الاستخدام من كل
-- مشروع "خلص" (archived_at) وتوظيفها في تحسين المشاريع القادمة.
--
-- قرارات نطاق مؤكّدة من المستخدم صراحة قبل البناء:
--   1) Semantic Search / Similarity: Embeddings حقيقية (pgvector + Gemini
--      text-embedding-004، بعد 768). مش Full-Text/Keyword قريب.
--   2) Prompt Evolution: سجل اقتراحات تحسين للمراجعة اليدوية بس — مفيش
--      نظام برومبتات مُدار بالكامل من الـ Database (البرومبتات نفسها
--      تفضل كود TypeScript ثابت زي ما هي، صفر تعديل).
--   3) نقطة "المشروع خلص": عند تعيين projects.archived_at (بدون عمود
--      جديد للحالة — إعادة استخدام آلية الأرشفة الموجودة أصلًا).
--
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

create extension if not exists vector;

-- ============================================================
-- Knowledge Extraction Jobs — تتبّع استخراج المعرفة لكل مشروع أُرشف
-- (نفس نمط الـ Lock الذري + Stale Reclaim من كل محرك سابق).
-- ============================================================
create table if not exists public.knowledge_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'idle'
    check (status in ('idle','running','ready','failed')),
  last_error text,
  extracted_count integer not null default 0,
  linked_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_knowledge_extraction_jobs_project on public.knowledge_extraction_jobs(project_id);

create or replace function public.touch_knowledge_extraction_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_knowledge_extraction_jobs_update_touch on public.knowledge_extraction_jobs;
create trigger on_knowledge_extraction_jobs_update_touch
  before update on public.knowledge_extraction_jobs
  for each row execute procedure public.touch_knowledge_extraction_jobs_updated_at();

-- ============================================================
-- Organizational Knowledge Base — المعرفة القابلة لإعادة الاستخدام،
-- مجرّدة عن أي بيانات عميل حقيقية (Masking إجباري قبل أي Insert).
-- Knowledge Validation: صف يفضل status='candidate' لحد ما (أ) يتكرر
-- عبر مشروع تاني (occurrence_count >= 2) أو (ب) يعتمده مستخدم يدويًا
-- (approved_by) — مفيش ترقية تلقائية لـ 'validated' من غير الشرطين دول.
-- ============================================================
create table if not exists public.organizational_knowledge (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in (
      'business_pattern','architecture_decision','ux_decision','ui_pattern',
      'reusable_component','common_requirement','common_risk','common_integration',
      'common_bug','common_mistake','successful_solution','failed_solution',
      'performance_lesson','security_lesson','deployment_lesson','support_lesson',
      'customer_feedback_pattern','meeting_decision_pattern','technical_decision','best_practice'
    )),
  title text not null,
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 50 check (confidence_score >= 0 and confidence_score <= 100),
  occurrence_count integer not null default 1,
  status text not null default 'candidate'
    check (status in ('candidate','validated','approved','rejected')),
  embedding vector(768),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organizational_knowledge_category on public.organizational_knowledge(category);
create index if not exists idx_organizational_knowledge_status on public.organizational_knowledge(status);
create index if not exists idx_organizational_knowledge_embedding on public.organizational_knowledge
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.touch_organizational_knowledge_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_organizational_knowledge_update_touch on public.organizational_knowledge;
create trigger on_organizational_knowledge_update_touch
  before update on public.organizational_knowledge
  for each row execute procedure public.touch_organizational_knowledge_updated_at();

-- ربط كل معرفة بكل مشروع ساهم فيها (Many-to-Many) — ده اللي بيسمح
-- بحساب occurrence_count الحقيقي ويوفّر Governance ("Source Projects").
create table if not exists public.organizational_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references public.organizational_knowledge(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type text not null
    check (source_type in ('brain','prd','prototype_review','developer_handoff','engineering_qa','support','production_monitoring','meeting')),
  source_reference text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_org_knowledge_sources_unique on public.organizational_knowledge_sources(knowledge_id, project_id, source_type);
create index if not exists idx_org_knowledge_sources_project on public.organizational_knowledge_sources(project_id);

-- ============================================================
-- Project-level Embedding — تمثيل دلالي لكل مشروع (من ملخص Brain
-- المعتمد) يُستخدم لحساب Cross-Project Similarity عبر pgvector.
-- ============================================================
create table if not exists public.project_embeddings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  embedding vector(768) not null,
  source_summary text not null default '',
  generated_at timestamptz not null default now()
);

create index if not exists idx_project_embeddings_vector on public.project_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- Intelligent Recommendations — بيتولّد لمشروع جديد اعتمادًا على
-- مشاريع سابقة مشابهة فقط (مفيش توصية بدون Evidence).
-- ============================================================
create table if not exists public.project_recommendations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null
    check (category in (
      'features','architecture','security','performance','integrations',
      'user_roles','business_rules','roadmap','kpis','user_stories',
      'meeting_questions','discovery_improvements','risk_mitigation'
    )),
  recommendation text not null,
  rationale text not null default '',
  confidence_score integer not null default 50 check (confidence_score >= 0 and confidence_score <= 100),
  supporting_project_ids jsonb not null default '[]'::jsonb,
  status text not null default 'suggested'
    check (status in ('suggested','accepted','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_project_recommendations_project on public.project_recommendations(project_id, created_at desc);

-- ============================================================
-- Decision Memory — قرارات مهمة من Project Brain مع سببها ونتيجتها،
-- تتحول لجزء من "ذاكرة الشركة".
-- ============================================================
create table if not exists public.decision_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  decision_title text not null,
  question text not null default '',
  rationale text not null default '',
  outcome text not null default 'unknown'
    check (outcome in ('succeeded','failed','unknown')),
  source_reference text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_decision_memory_project on public.decision_memory(project_id);

-- ============================================================
-- Prompt Improvement Suggestions — سجل اقتراحات للمراجعة اليدوية بس
-- (لا يُعدَّل أي ملف برومبت تلقائيًا، القرار مقصود حسب نطاق المرحلة).
-- ============================================================
create table if not exists public.prompt_improvement_suggestions (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  prompt_reference text not null,
  suggestion text not null,
  rationale text not null default '',
  supporting_project_ids jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 50 check (confidence_score >= 0 and confidence_score <= 100),
  status text not null default 'suggested'
    check (status in ('suggested','applied','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_prompt_improvement_suggestions_task on public.prompt_improvement_suggestions(task_type);

-- ============================================================
-- دوال بحث بالتشابه الدلالي (pgvector Cosine Distance) — تُستخدم في:
--   (أ) Dedup أثناء استخراج المعرفة (تفادي تكرار نفس الدرس بعناوين مختلفة)
--   (ب) Semantic Search في الـ Knowledge Base
--   (ج) Cross-Project Similarity (مشاريع سابقة مشابهة)
-- ============================================================

create or replace function public.match_organizational_knowledge(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  category text,
  title text,
  content text,
  confidence_score integer,
  occurrence_count integer,
  status text,
  similarity float
)
language sql stable as $$
  select
    ok.id, ok.category, ok.title, ok.content, ok.confidence_score, ok.occurrence_count, ok.status,
    1 - (ok.embedding <=> query_embedding) as similarity
  from public.organizational_knowledge ok
  where ok.status != 'rejected'
    and ok.embedding is not null
    and 1 - (ok.embedding <=> query_embedding) > match_threshold
  order by ok.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_similar_projects(
  query_embedding vector(768),
  exclude_project_id uuid,
  match_count int
)
returns table (project_id uuid, similarity float)
language sql stable as $$
  select pe.project_id, 1 - (pe.embedding <=> query_embedding) as similarity
  from public.project_embeddings pe
  where pe.project_id != exclude_project_id
  order by pe.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- AI Task Types الجديدة — بدون توليف Score بالـ AI (نفس فلسفة كل
-- محرك سابق: القيم الحسابية زي confidence/occurrence تُحسب بالكود).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('knowledge_extraction', 'gemini', 'gemini-3.5-flash'),
  ('project_recommendations', 'gemini', 'gemini-3.5-flash'),
  ('ai_product_advisor', 'gemini', 'gemini-3.5-flash'),
  ('prompt_improvement_suggestion', 'gemini', 'gemini-3.5-flash'),
  ('embedding', 'gemini', 'text-embedding-004')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط كل الجداول السابقة
-- ============================================================
alter table public.knowledge_extraction_jobs enable row level security;
alter table public.organizational_knowledge enable row level security;
alter table public.organizational_knowledge_sources enable row level security;
alter table public.project_embeddings enable row level security;
alter table public.project_recommendations enable row level security;
alter table public.decision_memory enable row level security;
alter table public.prompt_improvement_suggestions enable row level security;

create policy "internal_read_knowledge_extraction_jobs" on public.knowledge_extraction_jobs for select using (auth.uid() is not null);
create policy "internal_write_knowledge_extraction_jobs" on public.knowledge_extraction_jobs for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_organizational_knowledge" on public.organizational_knowledge for select using (auth.uid() is not null);
create policy "internal_write_organizational_knowledge" on public.organizational_knowledge for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_organizational_knowledge_sources" on public.organizational_knowledge_sources for select using (auth.uid() is not null);
create policy "internal_write_organizational_knowledge_sources" on public.organizational_knowledge_sources for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_project_embeddings" on public.project_embeddings for select using (auth.uid() is not null);
create policy "internal_write_project_embeddings" on public.project_embeddings for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_project_recommendations" on public.project_recommendations for select using (auth.uid() is not null);
create policy "internal_write_project_recommendations" on public.project_recommendations for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_decision_memory" on public.decision_memory for select using (auth.uid() is not null);
create policy "internal_write_decision_memory" on public.decision_memory for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_prompt_improvement_suggestions" on public.prompt_improvement_suggestions for select using (auth.uid() is not null);
create policy "internal_write_prompt_improvement_suggestions" on public.prompt_improvement_suggestions for all using (auth.uid() is not null) with check (auth.uid() is not null);
