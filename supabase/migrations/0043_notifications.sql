-- ============================================================
-- Intelligent Navigation & Notification Routing (Enhancement Phase)
-- — تحويل نظام الإشعارات من "Query حية على 8 جداول + حالة قراءة في
-- localStorage" لجدول حقيقي مادّي (Materialized) بحالة قراءة لكل
-- مستخدم، وRealtime، وسجل نشاط، وأرشفة/حذف ناعم — بدون كسر أي منطق
-- اكتشاف حالي (نفس الـ 9 مصادر، نفس المنطق، بس بيتخزّن دلوقتي بدل ما
-- يتحسب حي في كل تحميل صفحة).
--
-- قرار معماري مهم (موثّق في التقرير الختامي): "Sync-on-read
-- Materialization" — الإشعارات بتتحدّث (تُنشأ/تُؤرشف تلقائيًا) وقت أي
-- Poll/Fetch من أي مستخدم متصل (نفس دورة الـ Polling الحالية)، مش
-- Event-Sourced عند كل نقطة تغيير في الكود (كان محتاج تعديل عشرات
-- الأماكن المتفرقة في المشروع كله لأحداث زي "تم إرسال نموذج اكتشاف").
-- Realtime بيوصّل التحديث فورًا لكل المستخدمين التانيين المتصلين بمجرد
-- ما أي Sync واحد يحصل، فالتجربة الفعلية قريبة جدًا من Real-Time حقيقي.
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- مفتاح ثابت لكل إشعار حقيقي (نفس نمط الـ id المُركَّب المستخدم في
  -- نظام الإشعارات الحالي، مثلاً "brain-draft-<doc_id>") — يسمح بـ
  -- Upsert آمن (Idempotent) بدل تكرار نفس الإشعار عند كل Sync.
  dedupe_key text not null unique,
  type text not null,
  category text not null default 'general',
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null default '',
  message text not null,
  target_url text not null,
  target_module text,
  target_record_id text,
  target_context jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','archived','deleted')),
  source_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_notifications_status on public.notifications(status, created_at desc);
create index if not exists idx_notifications_project on public.notifications(project_id);
create index if not exists idx_notifications_type on public.notifications(type);

create or replace function public.touch_notifications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_notifications_update_touch on public.notifications;
create trigger on_notifications_update_touch
  before update on public.notifications
  for each row execute procedure public.touch_notifications_updated_at();

-- حالة "مقروء" لكل مستخدم على حدة (فريق صغير، كل عضو له حالة قراءة
-- مستقلة عن زمايله) — وجود صف = مقروء، غياب الصف = غير مقروء.
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists idx_notification_reads_user on public.notification_reads(user_id);

-- سجل النشاط (Activity Log) — Created/Opened/Read/Archived/Restored/Deleted
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  event_type text not null check (event_type in ('created','opened','read','archived','restored','deleted')),
  actor_id uuid references public.profiles(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_events_notification on public.notification_events(notification_id, created_at desc);

-- ============================================================
-- Row Level Security — نفس نمط كل الجداول السابقة (تسجيل دخول كافٍ،
-- RBAC على مستوى Server Action زي كل مكان تاني بالمشروع).
-- ============================================================
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_events enable row level security;

create policy "internal_read_notifications" on public.notifications for select using (auth.uid() is not null);
create policy "internal_write_notifications" on public.notifications for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_notification_reads" on public.notification_reads for select using (auth.uid() is not null);
create policy "internal_write_notification_reads" on public.notification_reads for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_notification_events" on public.notification_events for select using (auth.uid() is not null);
create policy "internal_write_notification_events" on public.notification_events for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Realtime — أول استخدام في المشروع كله. لازم الجدول يكون جزء من
-- publication supabase_realtime عشان postgres_changes تشتغل عليه.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.notification_reads;
