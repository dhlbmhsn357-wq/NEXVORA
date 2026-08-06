-- 0063_workflow_automation.sql
-- المرحلة الخامسة: Enterprise Workflow Automation Engine & Intelligent Notifications.
-- Event Bus (platform_events) + سجل تنفيذ الـ workflows (workflow_executions).
-- المنصة بقت event-driven: أي حدث مهم يطلق workflows تلقائيًا (مهام/
-- إشعارات/timeline/معرفة تنظيمية) بدون تدخل يدوي. إضافات فقط.

-- 1) ناقل الأحداث — سجل كل حدث مهم في المنصة (idempotent عبر dedupe_key)
create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  dedupe_key text unique,          -- منع تكرار نفس الحدث (مثلاً task-completed-<taskId>)
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_platform_events_type_time on public.platform_events (event_type, created_at desc);
create index if not exists idx_platform_events_project on public.platform_events (project_id, created_at desc);

-- 2) سجل تنفيذ الـ workflows (Automation Log) — لكل workflow اتشغّل لحدث
create table if not exists public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null,        -- معرّف الـ workflow في الكود (registry)
  event_id uuid references public.platform_events(id) on delete cascade,
  event_type text not null,
  project_id uuid references public.projects(id) on delete cascade,
  status text not null default 'completed' check (status in ('completed','failed','skipped')),
  actions_run jsonb not null default '[]'::jsonb,   -- [{action, ok, detail}]
  error text,
  attempts int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_workflow_executions_project on public.workflow_executions (project_id, created_at desc);
create index if not exists idx_workflow_executions_status on public.workflow_executions (status) where status = 'failed';
-- منع تكرار تنفيذ نفس (workflow, event)
create unique index if not exists idx_workflow_executions_dedupe on public.workflow_executions (workflow_id, event_id);

-- RLS
do $$
declare t text;
begin
  foreach t in array array['platform_events','workflow_executions'] loop
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

-- Realtime: بث سجل الأتمتة الحي للوحة
alter publication supabase_realtime add table public.workflow_executions;

-- AI: تلخيص/تحليل الأتمتة (اكتشاف الاختناقات + تقارير تنفيذية)
insert into public.ai_task_model_config (task_type, provider, model)
values ('automation_intelligence', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- audit_log: أحداث الأتمتة
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
    'ownership_assigned','ownership_transferred','delivery_approval','project_workspace_created',
    'workflow_executed','workflow_failed','escalation_triggered'
  ));
