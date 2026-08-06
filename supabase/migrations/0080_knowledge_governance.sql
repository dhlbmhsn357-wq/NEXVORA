-- ============================================================
-- 0080 — حوكمة المعرفة والجودة والحزم (Governance / QA / Packages)
--
-- المرحلة الخامسة، الجزءان السابع والثامن: طبقة التشغيل المؤسسية.
--
-- **بناء فوق كل ما سبق لا إعادة تصميم.** الجودة (`quality.ts`)
-- والتعارضات والفحص الأمني للملفات والتدقيق كلها موجودة. ده بيضيف
-- الطبقة الحاكمة الناقصة:
--   1. knowledge_governance_policies — دورة حياة المعرفة (احتفاظ/أرشفة/حذف)
--   2. knowledge_qa_reports          — تقرير جودة موحّد مخزَّن
--   3. knowledge_packages            — حزم التصدير/الاستيراد (نسخ احتياطي)
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0080_knowledge_governance_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) سياسات الحوكمة — دورة حياة المعرفة
--
-- «احتفظ بالمعرفة النشطة، أرشِف المتقادمة بعد ٩٠ يومًا، احذف المرفوضة
-- بعد ٣٠.» سياسة لكل نوع، والتنفيذ **مقترَح لا تلقائي** افتراضيًا —
-- الحذف قرار خطير يستحق موافقة.
-- ============================================================

create table if not exists public.knowledge_governance_policies (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  policy_type   text not null
    check (policy_type in ('retention','archive','deletion','version_retention')),
  -- نطاق التطبيق: نوع الكائن أو 'all'.
  scope         text not null default 'all',

  enabled       boolean not null default true,
  -- إعدادات السياسة: { maxAgeDays, appliesToStatuses[], minConfidence, keepVersions, ... }
  config        jsonb not null default '{}'::jsonb,
  -- التنفيذ: مقترَح (يحتاج موافقة) أو تلقائي.
  enforcement   text not null default 'suggest'
    check (enforcement in ('suggest','automatic')),

  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint knowledge_governance_policies_unique unique (project_id, policy_type, scope)
);

create index if not exists idx_knowledge_governance_policies_project
  on public.knowledge_governance_policies (project_id, enabled);


-- ============================================================
-- ٢) تقارير الجودة الموحّدة
--
-- تجميع quality + consistency + conflicts + PII في تقرير واحد مخزَّن،
-- بيتحسب تلقائيًا بعد أي تغيير معرفة. اللقطة بتتيح المقارنة عبر الزمن.
-- ============================================================

create table if not exists public.knowledge_qa_reports (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  overall_score integer not null check (overall_score between 0 and 100),
  -- تفصيل الأبعاد: { completeness, accuracy, consistency, freshness, ... }
  dimensions    jsonb not null default '{}'::jsonb,
  -- المشاكل المكتشَفة: [{ type, severity, detail, ref }]
  issues        jsonb not null default '[]'::jsonb,
  issue_count   integer not null default 0,
  critical_count integer not null default 0,
  -- عدد كائنات المحتوى اللي فيها بيانات حسّاسة محتملة (PII).
  pii_flag_count integer not null default 0,

  computed_at   timestamptz not null default now()
);

create index if not exists idx_knowledge_qa_reports_project
  on public.knowledge_qa_reports (project_id, computed_at desc);


-- ============================================================
-- ٣) حزم التصدير/الاستيراد — وحدة النسخ الاحتياطي
--
-- Knowledge Package = لقطة قابلة للنقل (JSON) للمعرفة مع إصداراتها
-- وعلاقاتها وبياناتها الوصفية. هي وحدة التصدير والنسخ الاحتياطي
-- والاستيراد معًا.
-- ============================================================

create table if not exists public.knowledge_packages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  kind          text not null check (kind in ('export','import','backup')),
  format        text not null default 'json' check (format in ('json','markdown','csv')),
  status        text not null default 'ready'
    check (status in ('building','ready','failed','imported')),

  object_count  integer not null default 0,
  -- بيانات وصفية للحزمة: { version, generatedAt, counts, checksum, ... }
  manifest      jsonb not null default '{}'::jsonb,
  -- مسار التخزين لو الحزمة كبيرة اتحفظت كملف (اختياري).
  storage_path  text,
  -- هل طُبّق إخفاء PII وقت التصدير؟
  pii_masked    boolean not null default false,

  last_error    text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_knowledge_packages_project
  on public.knowledge_packages (project_id, created_at desc);


-- ============================================================
-- ٤) أمان مستوى الصف — قراءة للمصادَقين، كتابة للخدمة + المدير
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'knowledge_governance_policies', 'knowledge_qa_reports', 'knowledge_packages'
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

-- ضبط السياسات فعل إداري — نسمح للمصادَقين بالكتابة (RBAC يُفرض في الخدمة).
drop policy if exists knowledge_governance_policies_auth_write on public.knowledge_governance_policies;
create policy knowledge_governance_policies_auth_write
  on public.knowledge_governance_policies for all to authenticated using (true) with check (true);


-- ============================================================
-- ٥) touch updated_at
-- ============================================================

drop trigger if exists on_knowledge_governance_policies_touch on public.knowledge_governance_policies;
create trigger on_knowledge_governance_policies_touch
  before update on public.knowledge_governance_policies
  for each row execute procedure public.touch_updated_at();


-- ============================================================
-- ٦) دالة: ملخّص الحوكمة في استعلام واحد
-- ============================================================

create or replace function public.knowledge_governance_summary(p_project_id uuid)
returns table (
  active_policies   bigint,
  latest_qa_score   integer,
  latest_qa_issues  integer,
  packages_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from knowledge_governance_policies p where p.project_id = p_project_id and p.enabled),
    (select overall_score from knowledge_qa_reports r where r.project_id = p_project_id order by r.computed_at desc limit 1),
    (select issue_count from knowledge_qa_reports r where r.project_id = p_project_id order by r.computed_at desc limit 1),
    (select count(*) from knowledge_packages k where k.project_id = p_project_id);
$$;

grant execute on function public.knowledge_governance_summary(uuid) to service_role, authenticated;
