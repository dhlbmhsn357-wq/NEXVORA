-- ============================================================
-- 0082 — منصّة الذاكرة المؤسسية (Organizational Memory Platform)
--
-- الطبقة الثالثة من المعرفة: خبرة متراكمة تُستخلَص من المشاريع المعتمَدة
-- بعد مراجعة المدير.
--
-- **طبقة مستقلة فوق Knowledge Hub وDomain Library لا بديلة عنهما.**
-- تسلسل المعرفة: معرفة المشروع → معرفة المجال → الذاكرة المؤسسية.
--
-- **بناء فوق الموجود:** المعرفة المهيكلة (٠٠٧٧)، حزم المجال (٠٨١)،
-- إخفاء PII (٠٨٠). ده بيضيف مكتبة الخبرات وسير الاعتماد البشري.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0082_organizational_memory_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) مكتبة الخبرات المؤسسية — المعرفة المعتمَدة القابلة لإعادة الاستخدام
--
-- كل صفّ = خبرة معتمَدة (نمط نجاح، درس مستفاد، أصل قابل لإعادة
-- الاستخدام...)، مصنّفة بالمجال، مُقيَّمة الثقة والأثر، متاحة لكل
-- المشاريع المستقبلية.
-- ============================================================

create table if not exists public.org_experiences (
  id            uuid primary key default gen_random_uuid(),

  experience_type text not null
    check (experience_type in (
      'success_pattern','failure_pattern','anti_pattern','lesson_learned',
      'reusable_workflow','reusable_module','reusable_business_rule',
      'reusable_architecture','reusable_checklist','reusable_prompt',
      'reusable_sop','reusable_api','reusable_db_model','best_practice'
    )),
  -- التصنيف — نصّ حر لدعم أي مجال حالي أو مستقبلي (المواصفة تصرّ على
  -- «كل الأنواع لا ERP فقط»). cross_domain / general مسموحان.
  domain        text not null default 'general',

  title         text not null,
  content       text not null default '',
  detail        jsonb not null default '{}'::jsonb,

  -- **مُنظَّفة من بيانات العملاء** قبل النشر — شرط أمني إلزامي.
  sanitized     boolean not null default true,

  confidence    integer not null default 50 check (confidence between 0 and 100),
  usage_count   integer not null default 0,
  impact_score  integer not null default 0 check (impact_score between 0 and 100),
  quality_score integer not null default 0 check (quality_score between 0 and 100),

  status        text not null default 'published'
    check (status in ('published','retired','archived')),

  -- المشاريع اللي ساهمت في هذه الخبرة — أساس التفسير (Explainability).
  source_project_ids uuid[] not null default '{}',

  version       integer not null default 1,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- تجزئة المحتوى — يتفادى تكرار نفس الخبرة.
  dedupe_hash   text not null,
  constraint org_experiences_dedupe_unique unique (dedupe_hash)
);

create index if not exists idx_org_experiences_domain
  on public.org_experiences (domain, experience_type, status);
create index if not exists idx_org_experiences_usage
  on public.org_experiences (status, usage_count desc);


-- ============================================================
-- ٢) مرشّحو الترقية — قيد المراجعة البشرية
--
-- الخبرة المستخلَصة **لا تدخل المكتبة مباشرة**. تُسجَّل كمرشّح ينتظر
-- قرار المدير: قبول / رفض / تعديل / دمج / أرشفة.
-- ============================================================

create table if not exists public.org_experience_candidates (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete set null,
  promotion_id  uuid,

  experience_type text not null,
  domain        text not null default 'general',
  title         text not null,
  content       text not null default '',
  detail        jsonb not null default '{}'::jsonb,
  sanitized     boolean not null default true,
  -- درجة ثقة مبدئية مقترَحة من الاستخلاص.
  suggested_confidence integer not null default 50 check (suggested_confidence between 0 and 100),

  status        text not null default 'pending'
    check (status in ('pending','approved','rejected','merged','archived')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decision_reason text,
  -- لو اندمجت في خبرة قائمة.
  merged_into   uuid references public.org_experiences(id) on delete set null,

  created_at    timestamptz not null default now()
);

create index if not exists idx_org_candidates_status
  on public.org_experience_candidates (status, created_at desc);
create index if not exists idx_org_candidates_project
  on public.org_experience_candidates (project_id);


-- ============================================================
-- ٣) إصدارات الخبرات — التراجع والمقارنة
-- ============================================================

create table if not exists public.org_experience_versions (
  id            uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.org_experiences(id) on delete cascade,
  version       integer not null,
  title         text not null,
  content       text not null default '',
  detail        jsonb not null default '{}'::jsonb,
  change_reason text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint org_experience_versions_unique unique (experience_id, version)
);

create index if not exists idx_org_experience_versions_exp
  on public.org_experience_versions (experience_id, version desc);


-- ============================================================
-- ٤) عمليات الترقية — سجلّ لكل تشغيل استخلاص لمشروع
-- ============================================================

create table if not exists public.org_promotions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  status        text not null default 'extracted'
    check (status in ('extracting','extracted','failed')),
  candidate_count integer not null default 0,
  promoted_count  integer not null default 0,
  triggered_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_org_promotions_project
  on public.org_promotions (project_id, created_at desc);


-- ============================================================
-- ٥) وزن الدمج للذاكرة المؤسسية
--
-- بين معيار المجال (٨٠) وأفضل ممارسة (٧٥): خبرة مؤسسية مُثبَتة أقوى من
-- ممارسة عامة، لكن أضعف من معيار قياسي مقصود. آمن لو اتكرّر.
-- ============================================================

-- محصَّن: يُدرَج فقط لو جدول الأوزان موجود (من ٠٨١). لو ٠٨١ لسه مش
-- مطبَّق، الترحيل يمرّ بلا فشل، والكود بيرجع للوزن الافتراضي (٧٨) من
-- weights.ts. طبّق ٠٨١ ليتفعّل التحكّم في الوزن من الجدول.
do $seed$
begin
  if to_regclass('public.knowledge_fusion_weights') is not null then
    insert into public.knowledge_fusion_weights (source_type, weight)
    values ('org_memory', 78)
    on conflict (source_type) do nothing;
  end if;
end $seed$;


-- ============================================================
-- ٦) أمان مستوى الصف
-- ============================================================

do $rls$
declare t text;
begin
  foreach t in array array[
    'org_experiences', 'org_experience_candidates',
    'org_experience_versions', 'org_promotions'
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
end $rls$;


-- ============================================================
-- ٧) touch updated_at
-- ============================================================

drop trigger if exists on_org_experiences_touch on public.org_experiences;
create trigger on_org_experiences_touch before update on public.org_experiences
  for each row execute procedure public.touch_updated_at();


-- ============================================================
-- ٨) دالة: ملخّص الذاكرة المؤسسية
-- ============================================================

create or replace function public.org_memory_summary()
returns table (
  total_experiences bigint,
  success_patterns  bigint,
  failure_patterns  bigint,
  lessons           bigint,
  reusable_assets   bigint,
  pending_review    bigint,
  benefiting_projects bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (select count(*) from org_experiences where status = 'published'),
    (select count(*) from org_experiences where status = 'published' and experience_type = 'success_pattern'),
    (select count(*) from org_experiences where status = 'published' and experience_type in ('failure_pattern','anti_pattern')),
    (select count(*) from org_experiences where status = 'published' and experience_type = 'lesson_learned'),
    (select count(*) from org_experiences where status = 'published' and experience_type like 'reusable_%'),
    (select count(*) from org_experience_candidates where status = 'pending'),
    (select count(distinct p) from org_experiences e, unnest(e.source_project_ids) as p where e.status = 'published');
$fn$;

grant execute on function public.org_memory_summary() to service_role, authenticated;
