-- ============================================================
-- Phase 11 — Smart Post-Launch Support: Database
-- إضافة عمود واحد على projects (widget_key) + جدولين جديدين.
-- لا تلمس project_brain / prd إطلاقًا.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ============================================================
-- 0) projects.widget_key — نفس نمط share_token المستخدم في
-- client_presentations/developer_handoff بالظبط، لكن هنا للسماح
-- بتضمين الـ Support Widget علنًا لكل مشروع عبر مفتاح فريد قابل للإلغاء.
-- ============================================================
alter table public.projects add column if not exists widget_key uuid unique;

-- ============================================================
-- 1) support_requests — سجل كل محادثة دعم انتهت (سواء اتحلت مباشرة
-- أو اتصعّدت)، مع سجل غير قابل للتعديل للمحادثة الكاملة.
-- ============================================================
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_transcript jsonb not null default '[]'::jsonb,
  request_type text not null default 'unclear'
    check (request_type in ('usage_question','usage_problem','bug','feature_request','change_request','unclear')),
  structured_summary jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'open'
    check (resolution_status in ('open','auto_resolved','escalated','in_progress','resolved')),
  escalated_at timestamptz,
  resolved_at timestamptz,
  related_prd_section text,
  related_brain_fact text,
  customer_identifier text,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_requests_project on public.support_requests(project_id, created_at desc);
create index if not exists idx_support_requests_customer on public.support_requests(project_id, customer_identifier);

-- Conversation Transcript غير قابل للتعديل بعد الحفظ — قيد فعلي على
-- مستوى القاعدة، مش مجرد اتفاق في طبقة التطبيق.
create or replace function public.prevent_transcript_update()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_transcript is distinct from old.conversation_transcript then
    raise exception 'conversation_transcript غير قابل للتعديل بعد الحفظ';
  end if;
  return new;
end;
$$;

drop trigger if exists on_support_requests_protect_transcript on public.support_requests;
create trigger on_support_requests_protect_transcript
  before update on public.support_requests
  for each row execute procedure public.prevent_transcript_update();

-- ============================================================
-- 2) support_observability_log — سجل تشخيصي بسيط لـ Escalations
-- وNotification Delivery وWidget Errors فقط (AI Requests/Errors
-- مُغطّاة بالفعل عبر ai_requests_log الموجود، بدون تكرار).
-- ============================================================
create table if not exists public.support_observability_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('escalation','notification_delivery','widget_error')),
  project_id uuid references public.projects(id) on delete set null,
  support_request_id uuid references public.support_requests(id) on delete set null,
  success boolean not null,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_observability_log_project on public.support_observability_log(project_id, created_at desc);

-- ============================================================
-- 3) Task Type جديد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('support_triage', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- Row Level Security — نفس نمط الجداول السابقة (كل مستخدم داخلي
-- مسجّل دخول). الـ Widget والـ API العام بيكتبوا عبر Service Role
-- Client (بيتخطى RLS بتصميم)، بنفس نمط present/[token] الموجود.
-- ============================================================
alter table public.support_requests enable row level security;
alter table public.support_observability_log enable row level security;

create policy "internal_read_support_requests" on public.support_requests
  for select using (auth.uid() is not null);
create policy "internal_write_support_requests" on public.support_requests
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_support_observability_log" on public.support_observability_log
  for select using (auth.uid() is not null);
create policy "internal_write_support_observability_log" on public.support_observability_log
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
