-- 0060_collaboration_hub.sql
-- المرحلة الثانية: Enterprise Internal Collaboration Hub.
-- محادثات (DM / قنوات مشاريع / أقسام / إعلانات) + رسائل + Threads +
-- مرفقات + تفاعلات + منشنز + إعلانات + إقرارات + عضوية + حالة قراءة.
-- إضافات فقط (additive) — لا مساس بأي جدول قائم.
-- يُنفَّذ يدويًا في Supabase SQL Editor.

-- 1) المحادثات
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','project','department','announcement')),
  project_id uuid references public.projects(id) on delete cascade,
  department text,                         -- لقنوات الأقسام
  channel_key text,                        -- لقنوات المشروع الفرعية: general/development/design/testing/deployment/support
  name text,
  created_by uuid references public.profiles(id),
  is_archived boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_conversations_project on public.conversations (project_id);
create index if not exists idx_conversations_type on public.conversations (type);
-- قناة مشروع واحدة لكل (مشروع، channel_key)
create unique index if not exists idx_conversations_project_channel
  on public.conversations (project_id, channel_key) where project_id is not null and channel_key is not null;
-- قناة قسم واحدة لكل اسم قسم
create unique index if not exists idx_conversations_department
  on public.conversations (department) where department is not null;

-- 2) عضوية المحادثة (من يقدر يشوف/يشارك) + حالة القراءة لكل عضو
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner','member')),
  muted boolean not null default false,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_conversation_members_user on public.conversation_members (user_id);

-- 3) الرسائل (Threads عبر parent_message_id)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  parent_message_id uuid references public.messages(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text','system')),
  quoted_message_id uuid references public.messages(id) on delete set null,
  is_pinned boolean not null default false,
  pinned_by uuid references public.profiles(id),
  pinned_at timestamptz,
  -- حقول الإعلانات (لرسائل قنوات النوع announcement)
  priority text check (priority in ('normal','high','urgent')),
  expires_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation_time on public.messages (conversation_id, created_at desc);
create index if not exists idx_messages_parent on public.messages (parent_message_id) where parent_message_id is not null;
create index if not exists idx_messages_pinned on public.messages (conversation_id) where is_pinned = true;
-- بحث نصّي كامل على جسم الرسالة
create index if not exists idx_messages_body_fts on public.messages using gin (to_tsvector('simple', coalesce(body, '')));

-- 4) المرفقات
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_message_attachments_message on public.message_attachments (message_id);
create index if not exists idx_message_attachments_project on public.message_attachments (project_id);

-- 5) التفاعلات (إيموجي)
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- 6) المنشنز (للإشعارات والبحث)
create table if not exists public.message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  mention_type text not null check (mention_type in ('user','admins','managers','project_team','department')),
  mentioned_user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_message_mentions_user on public.message_mentions (mentioned_user_id) where mentioned_user_id is not null;

-- 7) إقرارات الإعلانات (Acknowledgements)
create table if not exists public.announcement_acks (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- RLS: أي مستخدم مسجّل دخول (نفس سياسة المنصة؛ الصلاحيات الدقيقة في Server Actions)
do $$
declare t text;
begin
  foreach t in array array[
    'conversations','conversation_members','messages','message_attachments',
    'message_reactions','message_mentions','announcement_acks'
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

-- Realtime: بث التغييرات الحية (رسائل + تفاعلات + عضوية)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.conversation_members;

-- إعداد موديل مهمة تلخيص/استخراج المحادثات (AI Provider Layer)
insert into public.ai_task_model_config (task_type, provider, model)
values ('collaboration_summary', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- audit_log: أحداث التعاون
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
    'announcement_published','channel_membership_changed','message_converted'
  ));
