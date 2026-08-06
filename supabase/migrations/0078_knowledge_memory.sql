-- ============================================================
-- 0078 — الذاكرة الدلالية ورسم الأثر (Semantic Memory & Impact Graph)
--
-- المرحلة الخامسة، الجزء الرابع: استرجاع السياق وتحليل الأثر.
--
-- **بناء فوق ٠٠٥١ لا إعادة تصميم.** البحث الدلالي على عُقد Brain
-- (`knowledge_nodes` + `match_project_knowledge`) موجود وبيشتغل. ده
-- بيضيف طبقة **موازية** فوق كائنات مركز المعرفة المهيكلة (كيانات،
-- قواعد، متطلبات، قرارات، مخاطر، عناصر) — اللي عمرها ما دخلت الفهرس
-- الدلالي القديم.
--
-- **ليه جدول ذاكرة موحّد لا عمود embedding على كل جدول؟** لأن الاسترجاع
-- بيدوّر عبر كل الأنواع مرة واحدة: «كل ما يخصّ الفوترة» لازم يرجّع
-- كيانات وقواعد وقرارات معًا. فهرس واحد بيخلّي ده استعلامًا واحدًا بدل
-- ستة، وبيعزل بُعد المتجه عن جداول الأعمال.
--
-- **آمن على البيانات:** جداول ودوال جديدة فقط. pgvector مفعَّل من ٠٠٥١.
-- التراجع في 0078_knowledge_memory_rollback.sql.
-- ============================================================

create extension if not exists vector;


-- ============================================================
-- ١) الذاكرة الدلالية — فهرس موحّد لكل كائنات المعرفة
--
-- كل صف = كائن معرفة واحد (كيان/قاعدة/متطلب/قرار/مخاطرة/عنصر) مع نصّه
-- القابل للبحث ومتجهه. `object_type` + `object_id` بيشاورا للكائن
-- الأصلي، والنصّ منسوخ عشان البحث مايحتاجش JOIN وقت الاستعلام.
-- ============================================================

create table if not exists public.knowledge_memory (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  object_type   text not null
    check (object_type in ('entity','business_rule','workflow','requirement','decision','risk','item')),
  object_id     uuid not null,           -- المعرّف في جدول الكائن الأصلي

  title         text not null default '',
  content       text not null,           -- النصّ اللي اتعمله embedding
  embedding     vector(768),
  domain        text,                    -- المجال — للفلترة عند الاسترجاع

  content_hash  text not null,           -- يتفادى إعادة الـ embedding لنفس النصّ
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- كائن واحد له صفّ ذاكرة واحد — إعادة المعالجة تحدّثه لا تضاعفه.
  constraint knowledge_memory_object_unique unique (object_type, object_id)
);

create index if not exists idx_knowledge_memory_project
  on public.knowledge_memory (project_id, object_type);
create index if not exists idx_knowledge_memory_domain
  on public.knowledge_memory (project_id, domain) where domain is not null;

-- فهرس IVFFlat للتقارب — نفس نمط ٠٠٥١. lists=100 مناسب لعشرات الآلاف.
create index if not exists idx_knowledge_memory_embedding
  on public.knowledge_memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- ============================================================
-- ٢) حواف الأثر — رسم بياني عام بين أي كائنين
--
-- منفصل عن `knowledge_entity_relations` (كيان↔كيان فقط): ده بيربط أي
-- نوعين — «قرار» يؤثّر على «متطلب»، «مخاطرة» تهدّد «سير عمل». ده أساس
-- تحليل الأثر: «لو غيّرنا ده، إيه اللي بيتأثّر؟».
-- ============================================================

create table if not exists public.knowledge_impact_edges (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  from_type     text not null,
  from_id       uuid not null,
  to_type       text not null,
  to_id         uuid not null,
  edge_type     text not null default 'affects',  -- affects · depends_on · implements · threatens · supersedes
  weight        integer not null default 50 check (weight between 0 and 100),
  rationale     text not null default '',

  created_at    timestamptz not null default now(),

  constraint knowledge_impact_edges_unique unique (from_type, from_id, to_type, to_id, edge_type),
  constraint knowledge_impact_edges_no_self check (not (from_type = to_type and from_id = to_id))
);

create index if not exists idx_knowledge_impact_edges_project
  on public.knowledge_impact_edges (project_id);
create index if not exists idx_knowledge_impact_edges_from
  on public.knowledge_impact_edges (from_type, from_id);
create index if not exists idx_knowledge_impact_edges_to
  on public.knowledge_impact_edges (to_type, to_id);


-- ============================================================
-- ٣) دالة المطابقة الدلالية — عبر كل الأنواع أو نوع محدّد
--
-- نفس نمط `match_project_knowledge`، لكن على الذاكرة الموحّدة ومع فلتر
-- نوع اختياري. `p_object_type = null` بيدوّر عبر كل الأنواع.
-- ============================================================

create or replace function public.match_knowledge_memory(
  p_project_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_object_type text default null
)
returns table (
  id            uuid,
  object_type   text,
  object_id     uuid,
  title         text,
  content       text,
  domain        text,
  similarity    float
)
language sql stable as $$
  select
    m.id, m.object_type, m.object_id, m.title, m.content, m.domain,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.knowledge_memory m
  where m.project_id = p_project_id
    and m.embedding is not null
    and (p_object_type is null or m.object_type = p_object_type)
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge_memory(uuid, vector, float, int, text)
  to service_role, authenticated;


-- ============================================================
-- ٤) أمان مستوى الصف — قراءة للمصادَقين، كتابة للخدمة
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['knowledge_memory', 'knowledge_impact_edges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format(
      'create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t
    );
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format(
      'create policy %I_service_all on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;


-- ============================================================
-- ٥) touch updated_at على الذاكرة (الدالة العامة موجودة من ترحيلات سابقة)
-- ============================================================

drop trigger if exists on_knowledge_memory_touch on public.knowledge_memory;
create trigger on_knowledge_memory_touch before update on public.knowledge_memory
  for each row execute procedure public.touch_updated_at();
