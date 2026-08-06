-- 0062_delivery_lifecycle.sql
-- المرحلة الرابعة: Enterprise Project Assignment, Team Management & Delivery Lifecycle.
-- بتوسّع طبقة العمل (المرحلة 3) لـ: ملكية المشروع، مراحل تسليم غنية،
-- سجل اعتمادات، رؤية العميل، أدوار فريق أوسع. إضافات فقط. يُنفَّذ يدويًا.

-- 1) توسيع أدوار الفريق (project_members) للمجموعة الكاملة
alter table public.project_members drop constraint if exists project_members_project_role_check;
alter table public.project_members
  add constraint project_members_project_role_check
  check (project_role in (
    'pm','ba','designer','frontend','backend','fullstack','ai_engineer',
    'prompt_engineer','qa','devops','support','supervisor','executor'
  ));

-- 2) ملكية المشروع (أنواع ملكية متعددة لكل مشروع)
create table if not exists public.project_ownership (
  project_id uuid not null references public.projects(id) on delete cascade,
  ownership_type text not null check (ownership_type in ('project','technical','business','delivery','support')),
  user_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (project_id, ownership_type)
);
create index if not exists idx_project_ownership_user on public.project_ownership (user_id);

-- 3) إثراء milestones لتصبح مراحل تسليم (Delivery Phases) كاملة
alter table public.milestones
  add column if not exists objectives text,
  add column if not exists deliverables jsonb not null default '[]'::jsonb,
  add column if not exists expected_output text,
  add column if not exists start_date date,
  add column if not exists estimated_days int,
  add column if not exists assigned_user_ids uuid[] not null default '{}',
  add column if not exists visibility text not null default 'internal'
    check (visibility in ('internal','client_visible','hidden'));

-- 4) رؤية عناصر المهام للعميل (للـ Client Portal مستقبلًا)
alter table public.tasks
  add column if not exists visibility text not null default 'internal'
    check (visibility in ('internal','client_visible','hidden'));

-- 5) سجل اعتمادات التسليم (append-only)
create table if not exists public.delivery_approvals (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null check (status in ('pending','internal_review','manager_approved','client_approved','rejected','needs_revision')),
  note text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_delivery_approvals_milestone on public.delivery_approvals (milestone_id, created_at desc);

-- توسيع حالة اعتماد الـ milestone نفسها لتشمل مراحل الاعتماد الكاملة
alter table public.milestones drop constraint if exists milestones_approval_status_check;
alter table public.milestones
  add constraint milestones_approval_status_check
  check (approval_status in ('pending','internal_review','manager_approved','client_approved','approved','rejected','changes_requested','needs_revision'));

-- RLS
do $$
declare t text;
begin
  foreach t in array array['project_ownership','delivery_approvals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='public' and tablename='%1$s' and policyname='internal_all_%1$s') then
          create policy internal_all_%1$s on public.%1$s
            for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
        end if;
      end $inner$;
    $p$, t);
  end loop;
end $$;

-- AI: ذكاء التسليم (تنبؤ التأخير + ملخص أسبوعي + أدوار ناقصة + تحميل زائد)
insert into public.ai_task_model_config (task_type, provider, model)
values ('delivery_intelligence', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- audit_log: أحداث الملكية والتسليم
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check
  check (action in (
    'create','update','delete','stage_change',
    'login','logout','failed_login',
    'setup_completed','user_created','user_updated','user_deleted',
    'role_change','password_reset','password_changed','email_changed',
    'user_locked','user_unlocked','user_deactivated','user_reactivated','user_suspended',
    'message_edited','message_deleted','message_pinned','message_unpinned',
    'announcement_published','channel_membership_changed','message_converted',
    'project_member_added','project_member_removed','project_member_role_changed',
    'ownership_assigned','ownership_transferred','delivery_approval','project_workspace_created'
  ));
