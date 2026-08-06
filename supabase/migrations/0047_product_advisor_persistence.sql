-- ============================================================
-- AI Product Advisor — Persistence (Phase 6 follow-up)
-- كان تحليل "Preview" لحظي بدون تخزين — نتيجته بتختفي فور تغيير
-- التبويب أو تحديث الصفحة، وميكنش قابل لإعادة الاستخدام كسياق لمشاريع
-- تانية. الجدول ده بيخزّن آخر تحليل لكل مشروع (صف واحد بيتحدّث، مش
-- تاريخ نسخ — نفس نمط knowledge_extraction_jobs) + بيحوّله لـ Background
-- Job قابل للـ Polling بدل نداء متزامن.
-- ============================================================

create table if not exists public.product_advisor_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'idle'
    check (status in ('idle','generating','ready','failed')),
  result jsonb,
  last_error text,
  generated_from_brain_version integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_advisor_analyses_project on public.product_advisor_analyses(project_id);

create or replace function public.touch_product_advisor_analyses_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_product_advisor_analyses_update_touch on public.product_advisor_analyses;
create trigger on_product_advisor_analyses_update_touch
  before update on public.product_advisor_analyses
  for each row execute procedure public.touch_product_advisor_analyses_updated_at();

alter table public.product_advisor_analyses enable row level security;

create policy "internal_read_product_advisor_analyses" on public.product_advisor_analyses
  for select using (auth.uid() is not null);
create policy "internal_write_product_advisor_analyses" on public.product_advisor_analyses
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
