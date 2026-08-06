-- 0067_workspace_task_management.sql
-- نظام إدارة مهام مستقل (Task Management) تحت "مساحتي" — منفصل تمامًا عن
-- مهام المشاريع (جدول tasks / migration 0061) عشان ما يأثّرش على لوحة مهام
-- المشروع نهائيًا. مهمة هنا ممكن تكون بلا مشروع/عميل (اختياريين)، وبتدعم
-- Workflow مراجعة/اعتماد كامل. Additive-only وآمن لإعادة التشغيل.

-- 1) المهام
create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  project_id uuid references public.projects(id) on delete set null,   -- اختياري
  client_id uuid references public.clients(id) on delete set null,      -- اختياري
  priority text not null default 'medium'
    check (priority in ('critical','high','medium','low')),
  status text not null default 'todo'
    check (status in ('todo','in_progress','waiting_review','approved','completed','archived','blocked','cancelled')),
  start_date date,
  due_date date,
  checklist jsonb not null default '[]'::jsonb,   -- [{id,text,done}]
  links jsonb not null default '[]'::jsonb,       -- [{label,url}]
  tags text[] not null default '{}',
  notes text,
  reject_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,                          -- Soft delete فقط
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_wtasks_status on public.workspace_tasks(status) where deleted_at is null;
create index if not exists idx_wtasks_due on public.workspace_tasks(due_date);
create index if not exists idx_wtasks_project on public.workspace_tasks(project_id);
create index if not exists idx_wtasks_client on public.workspace_tasks(client_id);

create or replace function public.touch_wtasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_wtasks_update_touch on public.workspace_tasks;
create trigger on_wtasks_update_touch
  before update on public.workspace_tasks
  for each row execute procedure public.touch_wtasks_updated_at();

-- 2) المسؤولون (إسناد متعدّد)
create table if not exists public.workspace_task_assignees (
  task_id uuid not null references public.workspace_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists idx_wtask_assignees_user on public.workspace_task_assignees(user_id);

-- 3) التعليقات + التقارير المرحلية (is_report=true)
create table if not exists public.workspace_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workspace_tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  is_report boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wtask_comments_task on public.workspace_task_comments(task_id, created_at desc);

-- 4) المرفقات (نفس باكت chat-attachments)
create table if not exists public.workspace_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workspace_tasks(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wtask_attachments_task on public.workspace_task_attachments(task_id);

-- 5) سجل النشاط (Timeline)
create table if not exists public.workspace_task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.workspace_tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  -- created|status_changed|assigned|approved|rejected|comment_added|report_added|
  -- attachment_added|updated|started|completed|deleted
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_wtask_activity_task on public.workspace_task_activity(task_id, created_at desc);

-- RLS — نفس نمط المشروع (تسجيل دخول كافٍ؛ RBAC في Server Actions)
alter table public.workspace_tasks enable row level security;
alter table public.workspace_task_assignees enable row level security;
alter table public.workspace_task_comments enable row level security;
alter table public.workspace_task_attachments enable row level security;
alter table public.workspace_task_activity enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'workspace_tasks','workspace_task_assignees','workspace_task_comments',
    'workspace_task_attachments','workspace_task_activity'
  ] loop
    execute format('drop policy if exists internal_all_%1$s on public.%1$s;', tbl);
    execute format(
      'create policy internal_all_%1$s on public.%1$s for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);',
      tbl
    );
  end loop;
end $$;

-- Realtime للّوحة الحيّة
alter publication supabase_realtime add table public.workspace_tasks;
alter publication supabase_realtime add table public.workspace_task_assignees;
