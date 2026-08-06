-- ============================================================
-- 0079 — محرّك ذكاء المعرفة (Knowledge Intelligence Engine)
--
-- المرحلة الخامسة، الجزء الخامس: الطبقة الاستشارية.
--
-- **بناء فوق ٠٧١/٠٧٧/٠٧٨ لا إعادة تصميم.** الاستخراج والتعارضات
-- والفجوات والمخاطر والاكتمال كلها موجودة. ده بيضيف الطبقة اللي
-- **تُفكّر فوقها**: رؤى استشارية (معمارية، عمليات، تحسين، تنبّؤ
-- بالمخاطر) ودرجات نضج وجاهزية.
--
-- ثلاثة جداول:
--   1. knowledge_insights          — الرؤى الاستشارية المولَّدة
--   2. knowledge_intelligence_scores — لقطات النضج/الجاهزية عبر الزمن
--   3. knowledge_update_policies    — سياسة التحديث لكل موديول (الجزء ٦)
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0079_knowledge_intelligence_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) الرؤى الاستشارية
--
-- كل صفّ = رأي واحد من المستشار: نقص، تعارض، مخاطرة متوقَّعة، تحسين،
-- فرصة، اقتراح معماري. الرأي **مشروح** (rationale) و**مُتتبَّع**
-- (source_refs) و**مُقيَّم الأثر** (impact) — مواصفة Explainability
-- وDecision Traceability.
-- ============================================================

create table if not exists public.knowledge_insights (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  -- فئة الرأي — قائمة مغلقة عشان الفلترة والأولوية المهيكلة.
  insight_type  text not null
    check (insight_type in (
      'missing_capability',   -- نقص قدرة (صلاحيات، Audit، Backup...)
      'contradiction',        -- تعارض بين مصدرين
      'risk_prediction',      -- مخاطرة متوقَّعة قبل التنفيذ
      'optimization',         -- تحسين عملية أو أداء
      'architecture',         -- اقتراح معماري
      'business_process',     -- عنق زجاجة / خطوة يدوية / موافقة ناقصة
      'recommendation',       -- توصية أعمال عامة
      'opportunity'           -- فرصة جديدة
    )),

  title         text not null,
  detail        text not null default '',
  -- ليه؟ — الشرح الإلزامي (Explainability).
  rationale     text not null default '',
  -- الأثر لو اتنفّذ / لو اتجاهل.
  impact        text not null default '',
  -- الوحدة/المجال المعني.
  module        text,

  severity      text not null default 'medium'
    check (severity in ('critical','high','medium','low','info')),
  -- 0–100: جهد التنفيذ التقديري (لمصفوفة الأولوية).
  effort        integer not null default 50 check (effort between 0 and 100),
  confidence    integer not null default 60 check (confidence between 0 and 100),

  -- مصادر المعرفة اللي الرأي مبني عليها — Decision Traceability.
  -- [{ type: 'requirement'|'risk'|..., id, quote }]
  source_refs   jsonb not null default '[]'::jsonb,

  status        text not null default 'open'
    check (status in ('open','accepted','dismissed','resolved','superseded')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decision_reason text,

  -- تجزئة المحتوى — يتفادى تكرار نفس الرأي كل جولة تحليل.
  dedupe_hash   text not null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- رأي مفتوح واحد لكل تجزئة في المشروع — التوليد المتكرّر يحدّث لا يضاعف.
  constraint knowledge_insights_dedupe_unique unique (project_id, dedupe_hash)
);

create index if not exists idx_knowledge_insights_project
  on public.knowledge_insights (project_id, status, severity);
create index if not exists idx_knowledge_insights_type
  on public.knowledge_insights (project_id, insight_type);


-- ============================================================
-- ٢) لقطات النضج والجاهزية
--
-- درجات محسوبة في الكود (لا في القاعدة)، بتتخزّن كلقطة للعرض والمقارنة
-- عبر الزمن. الحساب منطق أعمال يتغيّر مع فهمنا — تجميده في SQL كان
-- بيربطه بترحيل كل مرة.
-- ============================================================

create table if not exists public.knowledge_intelligence_scores (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  maturity_score        integer not null check (maturity_score between 0 and 100),
  project_readiness     integer not null check (project_readiness between 0 and 100),
  architecture_readiness integer not null check (architecture_readiness between 0 and 100),
  requirement_coverage  integer not null default 0 check (requirement_coverage between 0 and 100),

  -- تفصيل الأبعاد اللي كوّنت الدرجات — للشفافية.
  breakdown     jsonb not null default '{}'::jsonb,
  -- عدّادات لحظية وقت اللقطة.
  open_insights integer not null default 0,
  open_conflicts integer not null default 0,
  open_gaps     integer not null default 0,

  computed_at   timestamptz not null default now()
);

create index if not exists idx_knowledge_intelligence_scores_project
  on public.knowledge_intelligence_scores (project_id, computed_at desc);


-- ============================================================
-- ٣) سياسة التحديث لكل موديول (الجزء السادس)
--
-- اليوم فيه مفتاح عام واحد (brain_settings.auto_resync_downstream). ده
-- بيدّي تحكّمًا **لكل موديول**: تحديث تلقائي، أو موافقة يدوية، أو أبدًا.
-- الصفّ الغائب معناه الافتراضي (موافقة يدوية) — أأمن سلوك.
-- ============================================================

create table if not exists public.knowledge_update_policies (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  -- مفتاح الموديول المستهدف (prd, prototype_prompt, architecture, ...).
  module_key    text not null,
  policy        text not null default 'manual_approval'
    check (policy in ('auto_update','manual_approval','never')),

  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),

  constraint knowledge_update_policies_unique unique (project_id, module_key)
);

create index if not exists idx_knowledge_update_policies_project
  on public.knowledge_update_policies (project_id);


-- ============================================================
-- ٤) أمان مستوى الصف — قراءة للمصادَقين، كتابة للخدمة
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'knowledge_insights', 'knowledge_intelligence_scores', 'knowledge_update_policies'
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

-- الموافقة على/رفض الرؤى فعل بشري — نسمح للمصادَقين يحدّثوا الحالة.
drop policy if exists knowledge_insights_auth_update on public.knowledge_insights;
create policy knowledge_insights_auth_update
  on public.knowledge_insights for update to authenticated using (true) with check (true);

drop policy if exists knowledge_update_policies_auth_write on public.knowledge_update_policies;
create policy knowledge_update_policies_auth_write
  on public.knowledge_update_policies for all to authenticated using (true) with check (true);


-- ============================================================
-- ٥) touch updated_at (الدالة العامة موجودة من ترحيلات سابقة)
-- ============================================================

drop trigger if exists on_knowledge_insights_touch on public.knowledge_insights;
create trigger on_knowledge_insights_touch before update on public.knowledge_insights
  for each row execute procedure public.touch_updated_at();


-- ============================================================
-- ٦) دالة: ملخّص الذكاء في استعلام واحد
-- ============================================================

create or replace function public.knowledge_intelligence_summary(p_project_id uuid)
returns table (
  open_insights     bigint,
  critical_insights bigint,
  accepted_insights bigint,
  latest_maturity   integer,
  latest_readiness  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from knowledge_insights i where i.project_id = p_project_id and i.status = 'open'),
    (select count(*) from knowledge_insights i where i.project_id = p_project_id and i.status = 'open' and i.severity = 'critical'),
    (select count(*) from knowledge_insights i where i.project_id = p_project_id and i.status = 'accepted'),
    (select maturity_score from knowledge_intelligence_scores s where s.project_id = p_project_id order by s.computed_at desc limit 1),
    (select project_readiness from knowledge_intelligence_scores s where s.project_id = p_project_id order by s.computed_at desc limit 1);
$$;

grant execute on function public.knowledge_intelligence_summary(uuid) to service_role, authenticated;


-- ============================================================
-- ٧) إعداد النموذج لمهمة الطبقة الاستشارية
--
-- بلا الصفّ ده الكود بيرجع لأشيع إعداد موجود (fallback) فيشتغل — لكن
-- الصفّ بيدّي التحكّم في اختيار النموذج من تبويب الإعدادات. آمن لو
-- اتكرّر (on conflict do nothing).
-- ============================================================

insert into public.ai_task_model_config (task_type, provider, model)
values ('knowledge_intelligence', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;
