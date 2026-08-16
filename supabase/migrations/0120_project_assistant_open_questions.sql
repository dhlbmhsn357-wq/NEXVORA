-- ============================================================================
-- 0120 — مساعد المشروع (Project Assistant) — أسئلة مفتوحة (Phase D)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- السبب: مفيش جدول "سؤال مفتوح" عام على مستوى المشروع في الكودبيز الحالي —
-- discovery_questions (0020) مربوطة بقالب Discovery، meeting_questions (0050)
-- مربوطة باجتماع محدد. مفيش أي منهم مناسب لربط "تحويل إلى سؤال مفتوح" من
-- إجابة مساعد المشروع (unresolved/not_found) لأنه سؤال عام على مستوى
-- المشروع، مش مقيّد باجتماع أو نموذج Discovery معيّن.
--
-- الجدول ده أبسط شيء ممكن: نص السؤال + مصدره (هنا دايمًا 'assistant') +
-- ربط اختياري بالمحادثة/الرسالة اللي طلعت منها + حالة open/resolved. بلا أي
-- workflow إضافي (لا تعيين، لا أولوية، لا تعليقات) — مقصود، مطابق للنطاق
-- المطلوب في Phase D بالظبط (قسم 6 من المواصفة).
-- ============================================================================

create table if not exists public.project_open_questions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,

  question          text not null,

  -- مصدر السؤال — حاليًا 'assistant' فقط (مساعد المشروع)، نص حر عشان
  -- يستوعب مصادر مستقبلية من غير migration جديدة.
  source            text not null default 'assistant',

  -- ربط اختياري بالمحادثة/الرسالة اللي طلع منها السؤال (لو المصدر assistant).
  conversation_id   uuid references public.project_assistant_conversations(id) on delete set null,
  message_id        uuid references public.project_assistant_messages(id) on delete set null,

  status            text not null default 'open' check (status in ('open', 'resolved')),

  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index if not exists idx_project_open_questions_project
  on public.project_open_questions (project_id, status);

alter table public.project_open_questions enable row level security;

drop policy if exists project_open_questions_auth_read on public.project_open_questions;
create policy project_open_questions_auth_read on public.project_open_questions
  for select to authenticated using (true);

drop policy if exists project_open_questions_auth_write on public.project_open_questions;
create policy project_open_questions_auth_write on public.project_open_questions
  for all to authenticated using (true) with check (true);
