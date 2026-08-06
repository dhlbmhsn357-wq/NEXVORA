-- 0071 — Knowledge Hub (طبقة ذكاء البيانات)
--
-- المشكلة: الـ Project Brain كان بيتغذّى من الاكتشاف والاجتماعات والقرارات
-- بس. في مشاريع الـ ERP والأنظمة الكبيرة، أغلب المعرفة الحقيقية جاية من
-- مستندات: سياسات، إجراءات تشغيل، أدلة، دراسات سوق، مخططات، تشريعات،
-- أبحاث الفريق. المرحلة دي بتحوّل المستندات دي لمعرفة منظّمة ومترابطة.
--
-- ملاحظات تصميمية:
--  - `content_hash` على المصدر بيمنع إعادة تحليل نفس الملف لو اترفع تاني.
--    ده أساس المعالجة التزايدية: الجديد بس هو اللي بيتحلّل.
--  - كل رفعة = `knowledge_batches` صف مستقل بترقيم إصدار، فينفع نقارن
--    النسخ ونعرف كل دفعة ضافت إيه.
--  - `knowledge_jobs` طابور معالجة صريح عشان الرفعات الكبيرة تتعالج على
--    دفعات وتقدر تكمّل بعد الانقطاع بدل ما تبدأ من الأول.
--
-- الهجرة إضافية بالكامل: مفيش drop ولا تعديل لأي جدول قائم.

-- ============================================================
-- 1) دفعات المعرفة (Versioning)
-- ============================================================

create table if not exists public.knowledge_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  title text not null default '',
  note text not null default '',
  status text not null default 'open'
    check (status in ('open','processing','ready','failed','partial')),
  source_count integer not null default 0,
  ready_count integer not null default 0,
  failed_count integer not null default 0,
  item_count integer not null default 0,
  -- الزيادة اللي اتولّدت من الدفعة دي (لو اتولّدت) — الربط بالمعالجة التزايدية
  increment_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_knowledge_batches_version
  on public.knowledge_batches (project_id, version);
create index if not exists idx_knowledge_batches_project
  on public.knowledge_batches (project_id, created_at desc);

-- ============================================================
-- 2) المصادر (ملف / رابط / نص ملصوق)
-- ============================================================

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  batch_id uuid references public.knowledge_batches(id) on delete set null,
  kind text not null default 'file'
    check (kind in ('file','url','pasted_text')),
  title text not null default '',
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  storage_path text,
  source_url text,
  -- تجزئة محتوى الملف — لو اترفع نفس الملف تاني بنتخطّاه بدل ما نعيد تحليله
  content_hash text,
  -- التصنيف الوظيفي اللي المستخدم بيختاره وقت الرفع (اختياري، بيوجّه الـ AI)
  declared_domain text,
  status text not null default 'pending'
    check (status in ('pending','extracting','classifying','enriching','ready','failed','skipped_duplicate')),
  last_error text,
  extracted_chars integer not null default 0,
  page_count integer,
  chunk_count integer not null default 0,
  item_count integer not null default 0,
  -- بيانات وصفية مستخرجة (عنوان المستند، الكاتب، التاريخ، اللغة...)
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_sources_project
  on public.knowledge_sources (project_id, created_at desc);
create index if not exists idx_knowledge_sources_batch
  on public.knowledge_sources (batch_id);
create index if not exists idx_knowledge_sources_status
  on public.knowledge_sources (project_id, status);
-- منع تكرار نفس الملف داخل نفس المشروع
create unique index if not exists idx_knowledge_sources_hash
  on public.knowledge_sources (project_id, content_hash)
  where content_hash is not null;

-- ============================================================
-- 3) المقاطع (Chunks) — النص المستخرج مقسّم للتحليل
-- ============================================================

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_index integer not null,
  content text not null default '',
  char_count integer not null default 0,
  -- موضع المقطع في المستند الأصلي: صفحة، ورقة Excel، مسار العناوين
  locator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_knowledge_chunks_source_index
  on public.knowledge_chunks (source_id, chunk_index);
create index if not exists idx_knowledge_chunks_project
  on public.knowledge_chunks (project_id);

-- ============================================================
-- 4) عناصر المعرفة (Knowledge Items) — الناتج المصنّف
-- ============================================================

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_id uuid references public.knowledge_chunks(id) on delete set null,
  batch_id uuid references public.knowledge_batches(id) on delete set null,
  -- التصنيف مفتوح عن قصد (text مش enum): المواصفة بتقول "وأي تصنيف جديد"،
  -- وقفله في CHECK كان هيمنع النظام من التعلّم بدون هجرة جديدة كل مرة.
  category text not null default 'unknown',
  title text not null default '',
  content text not null default '',
  confidence integer not null default 50 check (confidence between 0 and 100),
  -- الاقتباس الحرفي من المستند اللي العنصر ده اتبنى عليه
  evidence jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active','superseded','rejected','merged')),
  -- لو العنصر ده اندمج في عنصر تاني (إزالة التكرار)
  merged_into uuid references public.knowledge_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_items_project_category
  on public.knowledge_items (project_id, category, status);
create index if not exists idx_knowledge_items_source
  on public.knowledge_items (source_id);
create index if not exists idx_knowledge_items_batch
  on public.knowledge_items (batch_id);

-- ============================================================
-- 5) العلاقات (شبكة المعرفة)
--
-- الاسم `knowledge_item_relations` مش `knowledge_relations`: الاسم التاني
-- محجوز من هجرة 0051 لعلاقات عُقد شبكة معرفة الـ Brain، وأعمدته
-- from_node_id/to_node_id. لو استخدمناه هنا كان `create table if not
-- exists` هيتخطّى الإنشاء بصمت وبعدين الفهرس يفشل بعمود غير موجود.
-- الجدولان منفصلان عن قصد: ده بيربط عناصر المستندات، وده بيربط عُقد الـ Brain.
-- ============================================================

create table if not exists public.knowledge_item_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  to_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('supports','contradicts','duplicates','depends_on','refines','relates_to')),
  rationale text not null default '',
  confidence integer not null default 50 check (confidence between 0 and 100),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_knowledge_item_relations_unique
  on public.knowledge_item_relations (from_item_id, to_item_id, relation_type);
create index if not exists idx_knowledge_item_relations_project
  on public.knowledge_item_relations (project_id, relation_type);

-- ============================================================
-- 6) الفجوات المعرفية
-- ============================================================

create table if not exists public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  batch_id uuid references public.knowledge_batches(id) on delete set null,
  description text not null default '',
  why_it_matters text not null default '',
  needed_from text not null default 'client'
    check (needed_from in ('client','meeting','research','management','engineering')),
  priority text not null default 'medium'
    check (priority in ('high','medium','low')),
  status text not null default 'open'
    check (status in ('open','answered','converted_to_question','ignored')),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_gaps_project
  on public.knowledge_gaps (project_id, status, priority);

-- ============================================================
-- 7) التعارضات
-- ============================================================

create table if not exists public.knowledge_conflicts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- الطرفان ممكن يكونوا عنصرين معرفة، أو عنصر معرفة مقابل مصدر تاني في
  -- النظام (إجابة اكتشاف، قرار اجتماع) — عشان كده الوصف نصّي مش FK إجباري.
  left_item_id uuid references public.knowledge_items(id) on delete cascade,
  right_item_id uuid references public.knowledge_items(id) on delete cascade,
  left_label text not null default '',
  right_label text not null default '',
  left_statement text not null default '',
  right_statement text not null default '',
  external_source text
    check (external_source in ('discovery','meeting','decision','brain','recommendation')),
  description text not null default '',
  severity text not null default 'medium'
    check (severity in ('high','medium','low')),
  status text not null default 'open'
    check (status in ('open','resolved_left','resolved_right','resolved_other','ignored')),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_conflicts_project
  on public.knowledge_conflicts (project_id, status, severity);

-- ============================================================
-- 8) طابور المعالجة
-- ============================================================

create table if not exists public.knowledge_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  batch_id uuid references public.knowledge_batches(id) on delete cascade,
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  stage text not null
    check (stage in ('extract','classify','enrich','relate','gaps','cross_validate')),
  status text not null default 'queued'
    check (status in ('queued','running','done','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_jobs_pickup
  on public.knowledge_jobs (project_id, status, created_at);
create index if not exists idx_knowledge_jobs_source
  on public.knowledge_jobs (source_id, stage);

-- ============================================================
-- 9) updated_at triggers
-- ============================================================

create or replace function public.touch_knowledge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_knowledge_batches_updated_at on public.knowledge_batches;
create trigger trg_knowledge_batches_updated_at
  before update on public.knowledge_batches
  for each row execute function public.touch_knowledge_updated_at();

drop trigger if exists trg_knowledge_sources_updated_at on public.knowledge_sources;
create trigger trg_knowledge_sources_updated_at
  before update on public.knowledge_sources
  for each row execute function public.touch_knowledge_updated_at();

drop trigger if exists trg_knowledge_items_updated_at on public.knowledge_items;
create trigger trg_knowledge_items_updated_at
  before update on public.knowledge_items
  for each row execute function public.touch_knowledge_updated_at();

drop trigger if exists trg_knowledge_gaps_updated_at on public.knowledge_gaps;
create trigger trg_knowledge_gaps_updated_at
  before update on public.knowledge_gaps
  for each row execute function public.touch_knowledge_updated_at();

drop trigger if exists trg_knowledge_conflicts_updated_at on public.knowledge_conflicts;
create trigger trg_knowledge_conflicts_updated_at
  before update on public.knowledge_conflicts
  for each row execute function public.touch_knowledge_updated_at();

drop trigger if exists trg_knowledge_jobs_updated_at on public.knowledge_jobs;
create trigger trg_knowledge_jobs_updated_at
  before update on public.knowledge_jobs
  for each row execute function public.touch_knowledge_updated_at();

-- ============================================================
-- 10) RLS — قراءة للمستخدمين المصادَق عليهم، وكتابة للخدمة
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'knowledge_batches','knowledge_sources','knowledge_chunks','knowledge_items',
    'knowledge_item_relations','knowledge_gaps','knowledge_conflicts','knowledge_jobs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_auth_read', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      t || '_service_all', t
    );
  end loop;
end
$$;

-- المستخدم المصادَق عليه محتاج يحدّث حالة الفجوات والتعارضات من الواجهة.
drop policy if exists knowledge_gaps_auth_update on public.knowledge_gaps;
create policy knowledge_gaps_auth_update on public.knowledge_gaps
  for update to authenticated using (true) with check (true);

drop policy if exists knowledge_conflicts_auth_update on public.knowledge_conflicts;
create policy knowledge_conflicts_auth_update on public.knowledge_conflicts
  for update to authenticated using (true) with check (true);

-- ============================================================
-- 11) Storage bucket خاص + سياساته
-- ============================================================

insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false)
on conflict (id) do nothing;

drop policy if exists service_role_all_knowledge_storage on storage.objects;
create policy service_role_all_knowledge_storage on storage.objects
  for all to service_role
  using (bucket_id = 'knowledge')
  with check (bucket_id = 'knowledge');

-- الرفع بيحصل من المتصفح مباشرةً للتخزين، عشان نتخطّى حد حجم جسم الطلب
-- في دوال Vercel (حوالي 4.5MB) — نفس نمط تسجيل الاجتماعات.
drop policy if exists knowledge_files_auth_all on storage.objects;
create policy knowledge_files_auth_all on storage.objects
  for all to authenticated
  using (bucket_id = 'knowledge')
  with check (bucket_id = 'knowledge');
