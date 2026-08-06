-- ============================================================
-- 0077 — محرّك معالجة المعرفة (Knowledge Processing Engine)
--
-- المرحلة الخامسة، الجزء الثالث: استخراج ذكاء الأعمال المهيكل.
--
-- **بناء فوق ٠٠٧١ لا إعادة تصميم.** العناصر العامة (`knowledge_items`)
-- بتفضل زي ما هي؛ ده بيضيف **أنواعًا مهيكلة** بيتستخرجوا منها: كيانات،
-- قواعد عمل، سير عمل، متطلبات، قرارات، مخاطر.
--
-- ليه جداول منفصلة لا حقل `type` على `knowledge_items`؟ لأن لكل نوع
-- **حقولًا خاصة به**: قاعدة العمل ليها شرط ونتيجة، والقرار له صانع
-- وأثر، والمخاطرة ليها احتمال وشدّة. حشرهم في jsonb عام كان بيمنع أي
-- استعلام مهيكل عليهم — وده الغرض كله.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0077_knowledge_processing_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) الكيانات
--
-- الأشياء اللي المستند بيتكلّم عنها: أقسام، موظفون، عملاء، أنظمة،
-- سياسات... النوع مفتوح (نصّ لا enum) لأن المواصفة عدّدت ثلاثين نوعًا
-- ونموّها مستمر — قفله كان بيحتاج ترحيلًا لكل نوع جديد.
-- ============================================================

create table if not exists public.knowledge_entities (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  source_id     uuid references public.knowledge_sources(id) on delete set null,
  item_id       uuid references public.knowledge_items(id) on delete set null,

  entity_type   text not null default 'unknown',  -- department · employee · customer · system...
  name          text not null,
  -- مفتاح مطبَّع للدمج: كيانان بنفس المفتاح هما نفس الشيء.
  normalized_key text not null,
  description   text not null default '',
  attributes    jsonb not null default '{}'::jsonb,

  confidence    integer not null default 60 check (confidence between 0 and 100),
  mention_count integer not null default 1,
  evidence      jsonb not null default '[]'::jsonb,

  status        text not null default 'active'
    check (status in ('active','merged','rejected')),
  merged_into   uuid references public.knowledge_entities(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- كيان نشط واحد لكل (مشروع، نوع، مفتاح) — التكرار يندمج لا يتضاعف.
create unique index if not exists idx_knowledge_entities_key
  on public.knowledge_entities (project_id, entity_type, normalized_key)
  where status = 'active';
create index if not exists idx_knowledge_entities_project
  on public.knowledge_entities (project_id, entity_type);
create index if not exists idx_knowledge_entities_source
  on public.knowledge_entities (source_id) where source_id is not null;


-- ============================================================
-- ٢) العلاقات بين الكيانات
--
-- منفصلة عن `knowledge_item_relations` (اللي بتربط مقاطع نصّية):
-- دي بتربط **كيانات معرّفة** — موظف بقسم، فاتورة بدفعة.
-- ============================================================

create table if not exists public.knowledge_entity_relations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  from_entity_id uuid not null references public.knowledge_entities(id) on delete cascade,
  to_entity_id   uuid not null references public.knowledge_entities(id) on delete cascade,
  relation_type text not null,  -- belongs_to · owns · approves · depends_on...
  confidence    integer not null default 60 check (confidence between 0 and 100),
  evidence      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),

  constraint knowledge_entity_relations_unique
    unique (from_entity_id, to_entity_id, relation_type),
  constraint knowledge_entity_relations_no_self check (from_entity_id <> to_entity_id)
);

create index if not exists idx_knowledge_entity_relations_project
  on public.knowledge_entity_relations (project_id);
create index if not exists idx_knowledge_entity_relations_from
  on public.knowledge_entity_relations (from_entity_id);
create index if not exists idx_knowledge_entity_relations_to
  on public.knowledge_entity_relations (to_entity_id);


-- ============================================================
-- ٣) قواعد العمل
--
-- «إذا تجاوز الخصم ٢٠٪ يجب اعتماد المدير» — بتتخزّن **مهيكلة** لا
-- كنصّ: الشرط والنتيجة حقلان منفصلان عشان يتقارنوا ويتنفّذوا لاحقًا.
-- ============================================================

create table if not exists public.knowledge_business_rules (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  source_id     uuid references public.knowledge_sources(id) on delete set null,
  item_id       uuid references public.knowledge_items(id) on delete set null,

  name          text not null default '',
  condition     text not null,          -- «الخصم > ٢٠٪»
  action        text not null,          -- «اعتماد المدير مطلوب»
  rule_type     text not null default 'validation',  -- validation · approval · calculation · restriction
  scope         text,                   -- القسم أو الوحدة اللي بتحكمها
  priority      text not null default 'medium'
    check (priority in ('critical','high','medium','low')),

  confidence    integer not null default 60 check (confidence between 0 and 100),
  evidence      jsonb not null default '[]'::jsonb,
  status        text not null default 'active'
    check (status in ('active','superseded','rejected','conflicting')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_knowledge_business_rules_project
  on public.knowledge_business_rules (project_id, status);
create index if not exists idx_knowledge_business_rules_scope
  on public.knowledge_business_rules (project_id, scope) where scope is not null;


-- ============================================================
-- ٤) سير العمل وخطواته
--
-- «استلام الطلب ← اعتماد المدير ← المحاسبة ← المخزن ← الشحن» —
-- بتتخزّن **كبنية** لا كنصّ: كل خطوة صفّ بترتيب، فالرسم البياني يقدر
-- يمشي فيها ويكتشف الفجوات.
-- ============================================================

create table if not exists public.knowledge_workflows (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  source_id     uuid references public.knowledge_sources(id) on delete set null,

  name          text not null,
  description   text not null default '',
  trigger       text,                   -- اللي بيبدأ سير العمل
  outcome       text,                   -- النتيجة النهائية
  domain        text,                   -- المجال (مبيعات، محاسبة...)
  confidence    integer not null default 60 check (confidence between 0 and 100),
  status        text not null default 'active'
    check (status in ('active','superseded','rejected')),
  evidence      jsonb not null default '[]'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.knowledge_workflow_steps (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.knowledge_workflows(id) on delete cascade,
  step_index    integer not null,       -- الترتيب — أساس الرسم
  name          text not null,
  actor         text,                   -- مين بينفّذ الخطوة (قسم/دور)
  condition     text,                   -- شرط الانتقال للخطوة اللي بعدها
  is_approval   boolean not null default false,

  constraint knowledge_workflow_steps_unique unique (workflow_id, step_index)
);

create index if not exists idx_knowledge_workflows_project
  on public.knowledge_workflows (project_id, status);
create index if not exists idx_knowledge_workflow_steps_workflow
  on public.knowledge_workflow_steps (workflow_id, step_index);


-- ============================================================
-- ٥) المتطلبات
--
-- وظيفية وغير وظيفية وقيود وافتراضات ومعايير قبول — كل واحد بنوعه،
-- عشان توليد وثيقة المتطلبات لاحقًا يقدر يفلترهم.
-- ============================================================

create table if not exists public.knowledge_requirements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  source_id     uuid references public.knowledge_sources(id) on delete set null,
  item_id       uuid references public.knowledge_items(id) on delete set null,

  requirement_type text not null default 'functional'
    check (requirement_type in
      ('functional','non_functional','constraint','assumption','dependency','acceptance_criteria')),
  statement     text not null,
  rationale     text,
  priority      text not null default 'medium'
    check (priority in ('must','should','could','wont','medium')),
  module        text,                   -- الوحدة اللي بيخصّها

  confidence    integer not null default 60 check (confidence between 0 and 100),
  evidence      jsonb not null default '[]'::jsonb,
  status        text not null default 'active'
    check (status in ('active','superseded','rejected')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_knowledge_requirements_project
  on public.knowledge_requirements (project_id, requirement_type, status);


-- ============================================================
-- ٦) القرارات
--
-- كل قرار: النصّ، السبب، صاحبه، تاريخه، أثره، الوحدات المتأثّرة.
-- الوحدات المتأثّرة أساس تحليل الأثر في الجزء الرابع.
-- ============================================================

create table if not exists public.knowledge_decisions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  source_id     uuid references public.knowledge_sources(id) on delete set null,
  item_id       uuid references public.knowledge_items(id) on delete set null,

  decision      text not null,
  rationale     text,
  decision_maker text,
  decided_on    text,                   -- نصّ لا تاريخ: المصدر بيقول «الأسبوع الجاي» أحيانًا
  impact        text,
  affected_modules text[] not null default '{}',

  confidence    integer not null default 60 check (confidence between 0 and 100),
  evidence      jsonb not null default '[]'::jsonb,
  status        text not null default 'active'
    check (status in ('active','superseded','reversed')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_knowledge_decisions_project
  on public.knowledge_decisions (project_id, status);


-- ============================================================
-- ٧) المخاطر
--
-- بأنواعها: أعمال، تقنية، مالية، أمنية، تشغيلية، قانونية، معمارية.
-- الاحتمال × الشدّة = الأولوية، محسوبة في الكود لا هنا.
-- ============================================================

create table if not exists public.knowledge_risks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  source_id     uuid references public.knowledge_sources(id) on delete set null,
  item_id       uuid references public.knowledge_items(id) on delete set null,

  risk_type     text not null default 'operational'
    check (risk_type in
      ('business','technical','financial','security','operational','legal','architecture')),
  description   text not null,
  likelihood    text not null default 'medium' check (likelihood in ('high','medium','low')),
  severity      text not null default 'medium' check (severity in ('critical','high','medium','low')),
  mitigation    text,
  affected_area text,

  confidence    integer not null default 60 check (confidence between 0 and 100),
  evidence      jsonb not null default '[]'::jsonb,
  status        text not null default 'active'
    check (status in ('active','mitigated','accepted','rejected')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_knowledge_risks_project
  on public.knowledge_risks (project_id, risk_type, status);


-- ============================================================
-- ٨) اكتمال المعرفة لكل مجال
--
-- «المحاسبة ٩٢٪ · الموارد البشرية ٤١٪» — لقطة محسوبة، بتتخزّن للعرض
-- والمقارنة عبر الزمن. الحساب في الكود، والتخزين هنا.
-- ============================================================

create table if not exists public.knowledge_domain_completeness (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  domain        text not null,
  completeness  integer not null check (completeness between 0 and 100),
  entity_count  integer not null default 0,
  rule_count    integer not null default 0,
  requirement_count integer not null default 0,
  gap_count     integer not null default 0,
  missing_aspects text[] not null default '{}',
  computed_at   timestamptz not null default now(),

  constraint knowledge_domain_completeness_unique unique (project_id, domain, computed_at)
);

create index if not exists idx_knowledge_domain_completeness_project
  on public.knowledge_domain_completeness (project_id, computed_at desc);


-- ============================================================
-- ٩) أمان مستوى الصف — قراءة للمصادَقين، كتابة للخدمة
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'knowledge_entities', 'knowledge_entity_relations', 'knowledge_business_rules',
    'knowledge_workflows', 'knowledge_workflow_steps', 'knowledge_requirements',
    'knowledge_decisions', 'knowledge_risks', 'knowledge_domain_completeness'
  ] loop
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
-- ١٠) دالة: ملخّص المعالجة في استعلام واحد
-- ============================================================

create or replace function public.knowledge_processing_summary(p_project_id uuid)
returns table (
  entities      bigint,
  relations     bigint,
  rules         bigint,
  workflows     bigint,
  requirements  bigint,
  decisions     bigint,
  risks         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from knowledge_entities e where e.project_id = p_project_id and e.status = 'active'),
    (select count(*) from knowledge_entity_relations r where r.project_id = p_project_id),
    (select count(*) from knowledge_business_rules b where b.project_id = p_project_id and b.status = 'active'),
    (select count(*) from knowledge_workflows w where w.project_id = p_project_id and w.status = 'active'),
    (select count(*) from knowledge_requirements q where q.project_id = p_project_id and q.status = 'active'),
    (select count(*) from knowledge_decisions d where d.project_id = p_project_id and d.status = 'active'),
    (select count(*) from knowledge_risks k where k.project_id = p_project_id and k.status = 'active');
$$;

grant execute on function public.knowledge_processing_summary(uuid) to service_role, authenticated;
