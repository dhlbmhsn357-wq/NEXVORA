-- ============================================================
-- PM Operating System — 0023 Discovery Analysis Engine (Phase 4A)
--
-- يخزّن نتائج التحليل التفصيلي لنموذج الاكتشاف (17 قسمًا) مع كل
-- بيانات الـ observability (provider/model/tokens/cost/latency/retry).
-- إضافي بحت، آمن للتشغيل المتكرر (idempotent).
-- ============================================================

-- ============================================================
-- 1) discovery_analyses — سجل كامل لكل عملية تحليل
-- ============================================================
create table if not exists public.discovery_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  discovery_form_id uuid references public.discovery_forms(id) on delete set null,
  /** لقطة نصية من إجابات نموذج الاكتشاف وقت التشغيل (لتتبّع الإصدار) */
  discovery_version_hash text,

  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),

  provider text,
  model text,

  started_at timestamptz,
  finished_at timestamptz,
  execution_ms int,

  input_tokens int,
  output_tokens int,
  total_tokens int,
  estimated_cost_usd numeric(10, 4),

  retry_count int not null default 0,
  error_code text,
  error_message text,

  /** الناتج المُتحقَّق منه — schema ثابت (لبناء Project Brain لاحقًا) */
  output jsonb,
  version int not null default 1,

  acknowledged_at timestamptz,          -- لتصريف إشعار الفشل
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discovery_analyses_project
  on public.discovery_analyses(project_id, created_at desc);
create index if not exists idx_discovery_analyses_status
  on public.discovery_analyses(status);

-- ============================================================
-- 2) RLS — نفس سياسة النظام (أي مستخدم داخلي مسجّل دخول)
-- ============================================================
alter table public.discovery_analyses enable row level security;

drop policy if exists "internal_read_discovery_analyses" on public.discovery_analyses;
create policy "internal_read_discovery_analyses" on public.discovery_analyses
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_discovery_analyses" on public.discovery_analyses;
create policy "internal_write_discovery_analyses" on public.discovery_analyses
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 3) updated_at trigger (نفس الدالة الموجودة)
-- ============================================================
drop trigger if exists on_discovery_analyses_touch on public.discovery_analyses;
create trigger on_discovery_analyses_touch
  before update on public.discovery_analyses
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 4) تأكيد وجود الصف الافتراضي في ai_task_model_config لـ discovery_analysis
--    (موجود من migration 0003 لكن نعيد التأمين هنا للتشغيل الآمن)
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('discovery_analysis', 'gemini', 'gemini-2.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- انتهى 0023 Discovery Analysis Engine
-- ============================================================
