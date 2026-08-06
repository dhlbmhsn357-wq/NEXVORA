-- ============================================================
-- PM Operating System — 0055 AI Discovery Form Generator
--
-- يحوّل نظام قوالب الاكتشاف من مكتبة قوالب ثابتة إلى مولّد بالذكاء
-- الاصطناعي: كل فورم مُولَّد "هو" قالب في نفس جدولي
-- discovery_form_templates + discovery_questions، فيظهر تلقائيًا في
-- مكتبة القوالب ويشتغل مع البوابة العامة وخط تحليل الاكتشاف الموجود.
--
-- آمن للتشغيل أكثر من مرة (idempotent). كله additive — لا يكسر أي شيء.
-- ============================================================

-- ============================================================
-- 1) أنواع أسئلة جديدة + منطق شرطي على discovery_questions
--    (نوسّع الـ CHECK الموجود بدل استبداله)
-- ============================================================
alter table public.discovery_questions
  drop constraint if exists discovery_questions_type_check;

alter table public.discovery_questions
  add constraint discovery_questions_type_check
  check (type in (
    'short_text', 'long_text', 'yes_no', 'multiple_choice', 'checkbox',
    'rating', 'number', 'website', 'email', 'phone', 'date',
    'file_upload', 'logo_upload', 'document_upload',
    -- أنواع جديدة (0055)
    'currency', 'time', 'multi_select'
  ));

-- منطق الإظهار الشرطي: يُظهر السؤال فقط إذا تحقّق الشرط على إجابة سؤال سابق.
-- الشكل: { "dependsOn": "<question id>", "operator": "equals|not_equals|includes|exists|not_exists", "value": <any> }
-- null = السؤال يظهر دائمًا (السلوك الافتراضي — متوافق مع القديم).
alter table public.discovery_questions
  add column if not exists conditional jsonb;

-- ============================================================
-- 2) ميتاداتا المولّد على discovery_form_templates
--    (كلها nullable/بقيَم افتراضية — القوالب القديمة تفضل شغّالة)
-- ============================================================
alter table public.discovery_form_templates
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_generated')),
  add column if not exists industry_domain text,
  add column if not exists company_size text,
  add column if not exists complexity text,
  add column if not exists discovery_depth text,
  add column if not exists ai_version text,
  add column if not exists prompt_version text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists estimated_project_size text,
  add column if not exists estimated_question_count integer,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists usage_count integer not null default 0,
  add column if not exists last_used_at timestamptz,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists generation_input jsonb,
  add column if not exists version integer not null default 1;

create index if not exists idx_discovery_templates_source
  on public.discovery_form_templates(source);
create index if not exists idx_discovery_templates_favorite
  on public.discovery_form_templates(is_favorite);

-- ============================================================
-- 3) discovery_generation_jobs — تتبّع مهمة التوليد في الخلفية
-- ============================================================
create table if not exists public.discovery_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.discovery_form_templates(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  provider text,
  model text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd numeric,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_discovery_gen_jobs_status
  on public.discovery_generation_jobs(status);
create index if not exists idx_discovery_gen_jobs_created
  on public.discovery_generation_jobs(created_at desc);

-- ============================================================
-- 4) discovery_generation_feedback — أساس حلقة التعلّم
--    بعد تسليم الاكتشاف: نلتقط لكل سؤال مُولَّد هل اتجاوب أم اتخطّى،
--    عشان نتعلّم مع الوقت أي الأسئلة مفيدة فعلًا لكل مجال.
-- ============================================================
create table if not exists public.discovery_generation_feedback (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.discovery_form_templates(id) on delete cascade,
  discovery_form_id uuid,
  project_id uuid references public.projects(id) on delete set null,
  question_id text not null,
  question_label text not null,
  question_category text,
  question_type text,
  industry_domain text,
  was_answered boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_discovery_gen_feedback_template
  on public.discovery_generation_feedback(template_id);
create index if not exists idx_discovery_gen_feedback_domain
  on public.discovery_generation_feedback(industry_domain);

-- ============================================================
-- 5) صف افتراضي في ai_task_model_config لمهمة التوليد
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values ('discovery_form_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================
-- 6) RLS — نفس السياسة الداخلية المبسطة
-- ============================================================
alter table public.discovery_generation_jobs enable row level security;
alter table public.discovery_generation_feedback enable row level security;

drop policy if exists "internal_read_discovery_gen_jobs" on public.discovery_generation_jobs;
create policy "internal_read_discovery_gen_jobs" on public.discovery_generation_jobs
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_discovery_gen_jobs" on public.discovery_generation_jobs;
create policy "internal_write_discovery_gen_jobs" on public.discovery_generation_jobs
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_discovery_gen_feedback" on public.discovery_generation_feedback;
create policy "internal_read_discovery_gen_feedback" on public.discovery_generation_feedback
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_discovery_gen_feedback" on public.discovery_generation_feedback;
create policy "internal_write_discovery_gen_feedback" on public.discovery_generation_feedback
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- انتهى 0055 AI Discovery Form Generator
-- ============================================================
