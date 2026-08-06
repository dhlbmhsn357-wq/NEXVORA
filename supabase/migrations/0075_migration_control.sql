-- ============================================================
-- 0075 — التحكّم في الترحيل (Migration Control)
--
-- المرحلة الرابعة: نقل الخدمات الثقيلة للطابور خلف أعلام.
--
-- ثلاثة جداول فقط، **كلها جديدة**، ولا تعديل على أي جدول قائم:
--   ١) migration_flags        — حالة كل خدمة الآن
--   ٢) migration_flag_events  — سجل غير قابل للتعديل لكل تغيير
--   ٣) migration_comparisons  — قياس القديم مقابل الجديد
--
-- الترحيل ده **آمن على البيانات** بالكامل: إضافة محضة. التراجع في
-- 0075_migration_control_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) الأعلام — الحالة الحالية
--
-- **الافتراضي مطفأ، ونسبة النقل صفر.** الجدول يبدأ فاضيًا عمدًا:
-- الكود يفترض «مطفأ» عند غياب الصف، فحتى لو فشل هذا الترحيل تفضل
-- المنصة على المسار القديم بدل ما تتحوّل لمسار لم يُختبر إنتاجيًا.
-- ============================================================

create table if not exists public.migration_flags (
  service         text primary key,
  state           text not null default 'off',
  -- نسبة الطلبات التي تسلك المسار الجديد — للنقل التدريجي.
  rollout_percent integer not null default 0,
  updated_by      uuid references public.profiles(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint migration_flags_state check (state in ('off', 'on')),
  constraint migration_flags_percent check (rollout_percent between 0 and 100)
);


-- ============================================================
-- ٢) سجل التغييرات
--
-- منفصل عن جدول الحالة عن قصد: `migration_flags` يُكتب فوقه، وهذا
-- الجدول يُضاف إليه فقط. عند عطل بعد تغيير علم، هذا السجل هو أول ما
-- يُقرأ — ومن غيره يصبح السؤال «مين غيّر إيه ومتى» بلا إجابة.
-- ============================================================

create table if not exists public.migration_flag_events (
  id              uuid primary key default gen_random_uuid(),
  service         text not null,
  state           text not null,
  rollout_percent integer not null default 0,
  actor_id        uuid references public.profiles(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_migration_flag_events_service
  on public.migration_flag_events (service, created_at desc);


-- ============================================================
-- ٣) المقارنة — القديم مقابل الجديد
--
-- صفّ لكل تنفيذ: أي مسار سلك، وكم استغرق، وهل نجح، وهل رجع للقديم.
-- بدون قياس، الحكم على الترحيل انطباع، والانطباع لا يكشف تدهورًا
-- بطيئًا في نسبة النجاح.
--
-- الجدول ينمو مع كل نداء ذكاء اصطناعي، فبياناته **قصيرة العمر**:
-- التنظيف الدوري تحت.
-- ============================================================

create table if not exists public.migration_comparisons (
  id          bigserial primary key,
  service     text not null,
  task_type   text not null,
  path        text not null,
  latency_ms  integer not null,
  success     boolean not null,
  -- هل بدأ في المسار الجديد ثم رجع للقديم؟ مؤشّر أخطر من البطء.
  fell_back   boolean not null default false,
  reason      text,
  created_at  timestamptz not null default now(),

  constraint migration_comparisons_path check (path in ('legacy', 'new'))
);

create index if not exists idx_migration_comparisons_service
  on public.migration_comparisons (service, created_at desc);
create index if not exists idx_migration_comparisons_recent
  on public.migration_comparisons (created_at desc);
-- الرجوع المتكرر هو الإشارة التي تُقرأ أولًا عند الشك.
create index if not exists idx_migration_comparisons_fallback
  on public.migration_comparisons (service, created_at desc) where fell_back = true;


-- ============================================================
-- ٤) أمان مستوى الصف
--
-- القراءة للمصادَّقين، والكتابة لدور الخدمة وحده: تغيير علم يحوّل
-- مسار تنفيذ منصة حيّة، وده قرار تشغيلي لا يُترك لواجهة المستخدم.
-- ============================================================

alter table public.migration_flags        enable row level security;
alter table public.migration_flag_events  enable row level security;
alter table public.migration_comparisons  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'migration_flags', 'migration_flag_events', 'migration_comparisons'
  ] loop
    execute format('drop policy if exists %I_auth_read on public.%I', t, t);
    execute format(
      'create policy %I_auth_read on public.%I for select to authenticated using (true)', t, t
    );
    execute format('drop policy if exists %I_service_all on public.%I', t, t);
    execute format(
      'create policy %I_service_all on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;


-- ============================================================
-- ٥) دالة: تنظيف بيانات المقارنة
--
-- تُستدعى من المجدول. الاحتفاظ الافتراضي ثلاثون يومًا: أطول من أي
-- نافذة نقل، وأقصر من أن يتحوّل جدول القياس لأكبر جدول في القاعدة.
-- ============================================================

create or replace function public.prune_migration_comparisons(
  p_keep_days integer default 30
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  delete from public.migration_comparisons
   where created_at < now() - make_interval(days => p_keep_days);
  get diagnostics removed = row_count;
  return removed;
end $$;

grant execute on function public.prune_migration_comparisons(integer) to service_role;


-- ============================================================
-- ٦) دالة: ملخّص المقارنة
--
-- التجميع في استعلام واحد بدل سحب آلاف الصفوف للتطبيق — نفس الدرس
-- الذي أسقط المنصة في تدقيق المرحلة الأولى.
-- ============================================================

create or replace function public.migration_comparison_summary(
  p_since timestamptz default (now() - interval '7 days')
)
returns table (
  service             text,
  legacy_calls        bigint,
  new_calls           bigint,
  fallbacks           bigint,
  legacy_avg_ms       numeric,
  new_avg_ms          numeric,
  legacy_success_rate numeric,
  new_success_rate    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select c.service,
         count(*) filter (where c.path = 'legacy')::bigint,
         count(*) filter (where c.path = 'new')::bigint,
         count(*) filter (where c.fell_back)::bigint,
         avg(c.latency_ms) filter (where c.path = 'legacy')::numeric,
         avg(c.latency_ms) filter (where c.path = 'new')::numeric,
         (count(*) filter (where c.path = 'legacy' and c.success))::numeric
           / nullif(count(*) filter (where c.path = 'legacy'), 0),
         (count(*) filter (where c.path = 'new' and c.success))::numeric
           / nullif(count(*) filter (where c.path = 'new'), 0)
    from public.migration_comparisons c
   where c.created_at >= p_since
   group by c.service;
$$;

grant execute on function public.migration_comparison_summary(timestamptz)
  to service_role, authenticated;
