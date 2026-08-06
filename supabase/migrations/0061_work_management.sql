-- 0061_work_management.sql
-- المرحلة الثالثة: Enterprise Work Management & Task Orchestration Engine.
-- تعيين فريق المشروع + Milestones + Tasks (بتسلسل هرمي) + Assignees +
-- Dependencies + Comments + Activity + Attachments. طبقة التنفيذ الموحّدة
-- للمنصة كلها. إضافات فقط (additive). يُنفَّذ يدويًا في Supabase SQL Editor.

-- 1) تعيين فريق المشروع (أدوار داخل المشروع، منفصلة عن دور IAM العام)
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_role text not null default 'executor'
    check (project_role in ('pm','ba','designer','developer','qa','support','executor')),
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists idx_project_members_user on public.project_members (user_id);

-- 2) Milestones (مرحلة تسليم جديدة في الـ Workflow)
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  delivery_type text not null default 'custom'
    check (delivery_type in ('prototype','module','beta','alpha','release_candidate','final','custom')),
  planned_date date,
  actual_date date,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected','changes_requested')),
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  internal_notes text,
  client_feedback text,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_milestones_project on public.milestones (project_id, order_index);

-- 3) Tasks (تسلسل: Milestone ← Task ← Subtask عبر parent_task_id)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  task_type text not null default 'development',
  priority text not null default 'medium'
    check (priority in ('critical','high','medium','low','optional')),
  status text not null default 'backlog'
    check (status in ('backlog','planned','ready','in_progress','waiting','review','testing','blocked','completed','cancelled','archived')),
  start_date date,
  due_date date,
  estimated_hours numeric,
  actual_hours numeric,
  buffer_hours numeric,
  ai_estimate jsonb,                 -- {complexity, effort_hours, risk, rationale}
  checklist jsonb not null default '[]'::jsonb,  -- [{text, done}]
  source_type text,                  -- chat | eqa_finding | recommendation | brain_comment | meeting | incident | prototype_gap | manual
  source_reference text,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_project_status on public.tasks (project_id, status);
create index if not exists idx_tasks_milestone on public.tasks (milestone_id);
create index if not exists idx_tasks_parent on public.tasks (parent_task_id) where parent_task_id is not null;
create index if not exists idx_tasks_due on public.tasks (due_date) where due_date is not null;
create index if not exists idx_tasks_source on public.tasks (source_type, source_reference) where source_type is not null;

-- 4) Assignees (تعيين متعدد)
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists idx_task_assignees_user on public.task_assignees (user_id);

-- 5) Dependencies (منع البدء قبل اكتمال ما تعتمد عليه)
create table if not exists public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

-- 6) Comments (Markdown + mentions — نفس نمط الشات)
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null default '',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on public.task_comments (task_id, created_at);

-- 7) Activity (Timeline لكل مهمة)
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,          -- created|status_changed|assigned|unassigned|due_changed|comment_added|attachment_added|subtask_added|ai_subtasks|completed|converted
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_activity_project on public.task_activity (project_id, created_at desc);
create index if not exists idx_task_activity_task on public.task_activity (task_id, created_at desc);

-- 8) Attachments (نفس باكت chat-attachments)
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_attachments_task on public.task_attachments (task_id);

-- RLS: أي مستخدم مسجّل دخول (الصلاحيات الدقيقة في Server Actions)
do $$
declare t text;
begin
  foreach t in array array[
    'project_members','milestones','tasks','task_assignees','task_dependencies',
    'task_comments','task_activity','task_attachments'
  ] loop
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

-- Realtime: بث لوحة المهام الحية
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_assignees;
alter publication supabase_realtime add table public.milestones;

-- AI: مهمة التنسيق (اقتراح subtasks/تقدير/ملخص تقدّم)
insert into public.ai_task_model_config (task_type, provider, model)
values ('task_orchestration', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- audit_log: أحداث إدارية (تعيين فريق المشروع)
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
    'project_member_added','project_member_removed','project_member_role_changed'
  ));
