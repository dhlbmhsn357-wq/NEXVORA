-- ============================================================
-- PM Operating System — 0052 Smart Recommendations Engine v2
-- (Phase 4 — Enterprise Solution Intelligence)
--
-- إضافي بحت، idempotent. project_recommendations الموجود أصلًا (5
-- حقول، 13 فئة، suggested/accepted/dismissed بس) بيتوسّع في مكانه —
-- مفيش أي عمود اتشال أو صف اتحذف. زي كل جدول تصنيفي تاني في المشروع
-- ده (فئات الاجتماعات، فئات المعرفة، أقسام Brain)، الفئات نص + CHECK،
-- مش جدول Lookup منفصل — عمدًا، اتساقًا مع الاتفاقية المتّبعة في كل
-- الجداول السابقة، مش قصور في التطبيع.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 1) توسعة project_recommendations — الحقول الغنية المطلوبة (أولوية/
-- شدة/قيمة عمل/قيمة تقنية/وحدات متأثرة/معايير قبول/... ) + قرار موسّع
-- (Accept/Reject/Postpone/Needs Discussion بدل Accept/Dismiss بس).
-- ============================================================
alter table public.project_recommendations drop constraint if exists project_recommendations_category_check;
alter table public.project_recommendations add constraint project_recommendations_category_check
  check (category in (
    'business_logic', 'functional', 'non_functional', 'architecture', 'database',
    'performance', 'security', 'scalability', 'integration', 'automation',
    'workflow', 'reporting', 'analytics', 'notifications', 'validation',
    'permissions', 'compliance', 'accessibility', 'ux', 'ui',
    'ai_enhancement', 'future_expansion', 'organizational_improvement',
    -- القيم القديمة الـ13 فاضلة مدعومة (توصيات موجودة فعليًا بيها، صفر كسر).
    'features', 'integrations', 'user_roles', 'business_rules', 'roadmap',
    'kpis', 'user_stories', 'meeting_questions', 'discovery_improvements', 'risk_mitigation'
  ));

alter table public.project_recommendations drop constraint if exists project_recommendations_status_check;
alter table public.project_recommendations add constraint project_recommendations_status_check
  check (status in ('suggested', 'accepted', 'dismissed', 'postponed', 'needs_discussion'));

alter table public.project_recommendations
  add column if not exists priority text check (priority in ('critical', 'high', 'medium', 'low')),
  add column if not exists severity text check (severity in ('critical', 'high', 'medium', 'low')),
  add column if not exists business_value text check (business_value in ('high', 'medium', 'low')),
  add column if not exists technical_value text check (technical_value in ('high', 'medium', 'low')),
  add column if not exists affected_modules text[] not null default '{}',
  add column if not exists acceptance_criteria text[] not null default '{}',
  add column if not exists implementation_notes text not null default '',
  add column if not exists potential_risks text not null default '',
  add column if not exists expected_benefits text not null default '',
  add column if not exists estimated_complexity text check (estimated_complexity in ('small', 'medium', 'large', 'xlarge')),
  add column if not exists supporting_knowledge_node_ids uuid[] not null default '{}',
  add column if not exists supporting_consistency_issue_refs jsonb not null default '[]'::jsonb,
  add column if not exists evidence_source text not null default 'similarity'
    check (evidence_source in ('similarity', 'knowledge_graph', 'both')),
  add column if not exists version int not null default 1,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_project_recommendations_status on public.project_recommendations(project_id, status);

drop trigger if exists on_project_recommendations_touch on public.project_recommendations;
create trigger on_project_recommendations_touch before update on public.project_recommendations
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 2) recommendation_dependencies — "تفعيل الفروع المتعددة يتطلّب محاسبة
-- واعية بالفروع" — علاقات حقيقية بين توصيتين، نفس شكل knowledge_relations.
-- ============================================================
create table if not exists public.recommendation_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recommendation_id uuid not null references public.project_recommendations(id) on delete cascade,
  depends_on_recommendation_id uuid not null references public.project_recommendations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_recommendation_dependencies_project on public.recommendation_dependencies(project_id);
create unique index if not exists idx_recommendation_dependencies_unique
  on public.recommendation_dependencies(recommendation_id, depends_on_recommendation_id);

-- ============================================================
-- 3) recommendation_versions — سجل كامل (يفضل التاريخ متاح دايمًا، مفيش
-- استبدال صامت) — نفس نمط knowledge_versions بالظبط.
-- ============================================================
create table if not exists public.recommendation_versions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.project_recommendations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  change_reason text not null default '',
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_recommendation_versions_rec on public.recommendation_versions(recommendation_id, version desc);

-- ============================================================
-- 4) RLS للجداول الجديدة (project_recommendations أصلًا عليها RLS من 0041).
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['recommendation_dependencies', 'recommendation_versions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "internal_read_%s" on public.%I', t, t);
    execute format('create policy "internal_read_%s" on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists "internal_write_%s" on public.%I', t, t);
    execute format('create policy "internal_write_%s" on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
  end loop;
end $$;

-- ============================================================
-- انتهى 0052
-- ============================================================
