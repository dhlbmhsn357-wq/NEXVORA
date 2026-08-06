-- ============================================================
-- 0076 — أساسات مركز المعرفة المؤسسي (Knowledge Hub Foundation)
--
-- **بناء فوق ٠٠٧١، لا إعادة بناء له.**
--
-- الترحيل ٠٠٧١ أنشأ المركز: مصادر، دفعات، مقاطع، عناصر، علاقات،
-- فجوات، تعارضات، طابور. الترحيل ده بيضيف الطبقات اللي المواصفة
-- طلبتها وماكانتش موجودة:
--
--   ١) مساحات العمل     — عزل متعدّد الشركات (الأساس فقط)
--   ٢) إصدارات العناصر  — سلسلة إصدارات بالرجوع والفروق
--   ٣) الخط الزمني      — من أضاف، ومن عدّل، ومتى أثّر على العقل
--   ٤) الصلاحيات        — مصفوفة دور × إجراء
--   ٥) الجودة           — درجات مقاسة لا مقدَّرة
--   ٦) أعمدة إضافية     — على `knowledge_items` و`knowledge_sources`
--
-- **آمن على البيانات بالكامل:** جداول جديدة + أعمدة بقيم افتراضية.
-- مافيش حذف ولا تغيير نوع ولا إعادة تسمية. التراجع في
-- 0076_knowledge_hub_foundation_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) مساحات العمل — الأساس فقط
--
-- المواصفة طلبت دعم عدة شركات **مستقبلًا**. بناء نظام مستأجرين كامل
-- دلوقتي إفراط: مافيش شركة تانية، وكل تعقيد بيتضاف بلا مستخدم بيتحوّل
-- لدَين. اللي اتبنى هنا هو **نقطة الارتكاز**: جدول + عمود اختياري على
-- المشاريع + مساحة افتراضية.
--
-- لما تيجي الشركة التانية، الربط موجود ومحتاج تفعيل — مش إعادة تصميم.
-- ============================================================

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  is_default  boolean not null default false,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- مساحة واحدة افتراضية تنتمي لها كل المشاريع القائمة. بدونها، أي عمود
-- `workspace_id` هيبقى فاضي في كل الصفوف القديمة، وأي فلترة عليه
-- هتخفي بيانات موجودة.
insert into public.workspaces (name, slug, is_default)
values ('المساحة الرئيسية', 'default', true)
on conflict (slug) do nothing;

alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

update public.projects
   set workspace_id = (select id from public.workspaces where slug = 'default')
 where workspace_id is null;

create index if not exists idx_projects_workspace on public.projects (workspace_id);


-- ============================================================
-- ٢) إصدارات عناصر المعرفة
--
-- ٠٠٧١ فيه «دفعات» بأرقام إصدار — لكنها إصدار **للرفعة** لا للعنصر.
-- تعديل عنصر كان بيكتب فوق القديم، فالمواصفة طلبت العكس صراحةً:
-- «ولا يسمح بالكتابة فوق النسخة القديمة».
--
-- كل تعديل بيكتب صفًّا هنا **قبل** ما يعدّل العنصر. الرجوع = قراءة
-- الصف ونسخه فوق العنصر، مع كتابة صفّ جديد للرجوع نفسه — فالتاريخ
-- بيفضل كامل حتى بعد التراجع.
-- ============================================================

create table if not exists public.knowledge_object_versions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.knowledge_items(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  version       integer not null,

  -- لقطة كاملة لا فرق محسوب: الفروق تُحسب عند العرض، والاسترجاع
  -- بيحتاج الحالة كاملة. سلسلة فروق بتتكسر لو ضاعت حلقة.
  title         text not null default '',
  content       text not null default '',
  category      text not null default 'unknown',
  tags          text[] not null default '{}',
  confidence    integer not null default 50,
  metadata      jsonb not null default '{}'::jsonb,
  content_hash  text,

  change_reason text,
  change_kind   text not null default 'update'
    check (change_kind in ('create','update','rollback','merge','import','review')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint knowledge_object_versions_unique unique (item_id, version),
  constraint knowledge_object_versions_positive check (version > 0)
);

create index if not exists idx_knowledge_object_versions_item
  on public.knowledge_object_versions (item_id, version desc);
create index if not exists idx_knowledge_object_versions_project
  on public.knowledge_object_versions (project_id, created_at desc);


-- ============================================================
-- ٣) الخط الزمني
--
-- منفصل عن `job_events` و`platform_events` عن قصد: دول سجلّات تشغيل
-- تقنية، وده سجل **يقرأه إنسان** — من أضاف المعرفة، ومن راجعها، ومتى
-- أثّرت على عقل المشروع.
--
-- الفصل بيخلّي العرض بسيطًا والاحتفاظ مختلفًا: سجل التشغيل يُنظَّف
-- دوريًا، والخط الزمني بيفضل.
-- ============================================================

create table if not exists public.knowledge_timeline (
  id          bigserial primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  item_id     uuid references public.knowledge_items(id) on delete cascade,
  source_id   uuid references public.knowledge_sources(id) on delete cascade,

  event_type  text not null,
  actor_id    uuid references public.profiles(id) on delete set null,
  -- الفاعل مش دايمًا إنسان: الاستخراج والإثراء بيعملهم عامل.
  actor_kind  text not null default 'user'
    check (actor_kind in ('user','worker','system')),

  summary     text not null default '',
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_knowledge_timeline_project
  on public.knowledge_timeline (project_id, created_at desc);
create index if not exists idx_knowledge_timeline_item
  on public.knowledge_timeline (item_id, created_at desc) where item_id is not null;
create index if not exists idx_knowledge_timeline_type
  on public.knowledge_timeline (project_id, event_type, created_at desc);


-- ============================================================
-- ٤) الصلاحيات
--
-- المصفوفة **في الكود** لا في القاعدة: القواعد ثابتة ويحكمها منطق،
-- وقراءتها من جدول في كل فحص بتضيف رحلة شبكة بلا مقابل.
--
-- الجدول ده للاستثناءات فقط: منح فرد صلاحية أعلى على مشروع بعينه.
-- فاضي في الحالة الطبيعية، وده مقصود.
-- ============================================================

create table if not exists public.knowledge_permission_grants (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- الإجراء الممنوح: read · create · update · delete · review · rollback · export
  action      text not null,
  granted_by  uuid references public.profiles(id) on delete set null,
  reason      text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint knowledge_permission_grants_unique unique (project_id, profile_id, action)
);

create index if not exists idx_knowledge_permission_grants_lookup
  on public.knowledge_permission_grants (profile_id, project_id);


-- ============================================================
-- ٥) درجات الجودة
--
-- درجة واحدة مركّبة كانت هتخفي السبب. المواصفة طلبت ثمانية أبعاد،
-- وكل بُعد بيتخزّن على حدة عشان «الجودة ٦٢٪» تبقى قابلة للتفسير:
-- ناقصة في إيه بالظبط.
--
-- الحساب في الكود (وحدة نقية قابلة للاختبار)، والتخزين هنا للتاريخ
-- والمقارنة عبر الزمن.
-- ============================================================

create table if not exists public.knowledge_quality_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,

  overall             integer not null check (overall between 0 and 100),
  completeness        integer not null default 0,
  consistency         integer not null default 0,
  confidence          integer not null default 0,
  coverage            integer not null default 0,
  freshness           integer not null default 0,

  duplicate_count     integer not null default 0,
  contradiction_count integer not null default 0,
  missing_count       integer not null default 0,

  item_count          integer not null default 0,
  source_count        integer not null default 0,

  computed_at         timestamptz not null default now()
);

create index if not exists idx_knowledge_quality_project
  on public.knowledge_quality_snapshots (project_id, computed_at desc);


-- ============================================================
-- ٦) توسعة العناصر والمصادر
--
-- الأعمدة دي كلها اختيارية أو بقيم افتراضية — الصفوف القائمة تفضل
-- صالحة، والكود القديم يفضل شغّالًا.
-- ============================================================

alter table public.knowledge_items
  add column if not exists workspace_id       uuid references public.workspaces(id) on delete restrict,
  add column if not exists version            integer not null default 1,
  add column if not exists content_hash       text,
  add column if not exists language           text,
  add column if not exists summary            text,
  add column if not exists importance         integer not null default 50
    check (importance between 0 and 100),
  add column if not exists visibility         text not null default 'project'
    check (visibility in ('project','workspace','private')),
  add column if not exists owner_id           uuid references public.profiles(id) on delete set null,
  add column if not exists created_by         uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by         uuid references public.profiles(id) on delete set null,
  add column if not exists ai_status          text not null default 'pending',
  add column if not exists processing_version integer not null default 1,
  add column if not exists metadata           jsonb not null default '{}'::jsonb,
  add column if not exists reviewed_at        timestamptz,
  add column if not exists reviewed_by        uuid references public.profiles(id) on delete set null;

update public.knowledge_items
   set workspace_id = (select id from public.workspaces where slug = 'default')
 where workspace_id is null;

create index if not exists idx_knowledge_items_workspace
  on public.knowledge_items (workspace_id, category);
create index if not exists idx_knowledge_items_hash
  on public.knowledge_items (project_id, content_hash) where content_hash is not null;
create index if not exists idx_knowledge_items_importance
  on public.knowledge_items (project_id, importance desc) where status = 'active';

alter table public.knowledge_sources
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete restrict,
  add column if not exists language      text,
  add column if not exists source_kind   text,
  add column if not exists ingest_job_id uuid references public.jobs(id) on delete set null;

update public.knowledge_sources
   set workspace_id = (select id from public.workspaces where slug = 'default')
 where workspace_id is null;

create index if not exists idx_knowledge_sources_hash
  on public.knowledge_sources (project_id, content_hash) where content_hash is not null;


-- ============================================================
-- ٧) أمان مستوى الصف
-- ============================================================

alter table public.workspaces                     enable row level security;
alter table public.knowledge_object_versions      enable row level security;
alter table public.knowledge_timeline             enable row level security;
alter table public.knowledge_permission_grants    enable row level security;
alter table public.knowledge_quality_snapshots    enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'workspaces', 'knowledge_object_versions', 'knowledge_timeline',
    'knowledge_permission_grants', 'knowledge_quality_snapshots'
  ] loop
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
-- ٨) دالة: صحة المعرفة في استعلام واحد
--
-- اللوحة كانت هتحتاج ست استعلامات منفصلة. استعلام واحد بدلها — نفس
-- درس نمط N+1 اللي أسقط المنصة في تدقيق المرحلة الأولى.
-- ============================================================

create or replace function public.knowledge_hub_health(p_project_id uuid)
returns table (
  source_count      bigint,
  ready_sources     bigint,
  failed_sources    bigint,
  item_count        bigint,
  relation_count    bigint,
  gap_count         bigint,
  conflict_count    bigint,
  version_count     bigint,
  pending_reviews   bigint,
  avg_confidence    numeric,
  last_ingest_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from knowledge_sources s where s.project_id = p_project_id),
    (select count(*) from knowledge_sources s where s.project_id = p_project_id and s.status = 'ready'),
    (select count(*) from knowledge_sources s where s.project_id = p_project_id and s.status = 'failed'),
    (select count(*) from knowledge_items i where i.project_id = p_project_id and i.status = 'active'),
    (select count(*) from knowledge_item_relations r where r.project_id = p_project_id),
    (select count(*) from knowledge_gaps g where g.project_id = p_project_id),
    (select count(*) from knowledge_conflicts c where c.project_id = p_project_id),
    (select count(*) from knowledge_object_versions v where v.project_id = p_project_id),
    (select count(*) from knowledge_items i where i.project_id = p_project_id
        and i.status = 'active' and i.reviewed_at is null),
    (select avg(i.confidence) from knowledge_items i where i.project_id = p_project_id and i.status = 'active'),
    (select max(s.created_at) from knowledge_sources s where s.project_id = p_project_id);
$$;

grant execute on function public.knowledge_hub_health(uuid) to service_role, authenticated;
