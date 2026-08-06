-- 0065_executive_command_center.sql
-- المرحلة السابعة: Executive AI Command Center (العقل التنفيذي — COO).
-- طبقة تنفيذية على مستوى الشركة كاملة تجمّع كل الوحدات السابقة وتحسب
-- Company Health Score + KPIs، وتخزّن لقطات زمنية للاتجاهات، وتقارير
-- تنفيذية، ورؤى مساعد AI. إضافات فقط — لا يوجد تعديل هدّام، وكل
-- الأرقام مشتقّة من بيانات حقيقية (لا اختلاق).

-- 1) لقطات صحة الشركة (سلسلة زمنية للاتجاهات)
create table if not exists public.company_metrics (
  id uuid primary key default gen_random_uuid(),
  snapshot_at timestamptz not null default now(),
  health_score int not null check (health_score between 0 and 100),
  health_band text not null check (health_band in ('green','yellow','red')),
  kpis jsonb not null default '{}'::jsonb,        -- {key: value}
  breakdown jsonb not null default '[]'::jsonb,   -- [{key,label,score,weight}]
  signals jsonb not null default '{}'::jsonb       -- الأرقام الخام المجمّعة
);
create index if not exists idx_company_metrics_time on public.company_metrics (snapshot_at desc);

-- 2) التقارير التنفيذية (أسبوعي/شهري/ربع سنوي/سنوي/حسب القسم…)
create table if not exists public.executive_reports (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('weekly','monthly','quarterly','annual','portfolio','engineering','support','delivery','risk')),
  title text not null,
  status text not null default 'ready' check (status in ('generating','ready','failed')),
  executive_summary text,
  kpis jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,  -- {risks[],recommendations[],predictions[],action_plan[]}
  health_score int,
  last_error text,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);
create index if not exists idx_executive_reports_time on public.executive_reports (generated_at desc);

-- 3) رؤى المساعد التنفيذي (أسئلة/أجوبة + تنبؤات) — مؤرشفة للرجوع
create table if not exists public.executive_insights (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'assistant' check (kind in ('assistant','prediction')),
  question text,
  answer text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_executive_insights_time on public.executive_insights (created_at desc);

-- RLS: مسجّل الدخول فقط (التقييد الفعلي لدور owner/admin في طبقة الـ
-- Server Actions/الصفحة عبر requireAdmin — نفس نمط باقي المنصة).
do $$
declare t text;
begin
  foreach t in array array['company_metrics','executive_reports','executive_insights'] loop
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

-- Realtime: بث لقطات الصحة الحيّة للوحة القيادة
alter publication supabase_realtime add table public.company_metrics;

-- AI: المساعد التنفيذي + توليد التقارير
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('executive_intelligence', 'gemini', 'gemini-3.5-flash'),
  ('executive_report', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;
