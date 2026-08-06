-- 0068_lead_editing.sql
-- تعديل بيانات العملاء المحتملين مع حفظ سجل التعديلات. Additive-only.
-- بيانات الشركة/المسؤول بتعيش في clients/contacts؛ التعديل بيلمسهم +
-- leads. بنضيف updated_at/updated_by على leads + جدول lead_versions
-- (نفس نمط recommendation_versions) لحفظ لقطة قبل كل تعديل.

alter table public.leads
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- Trigger لتحديث updated_at تلقائيًا (يعيد استخدام touch_updated_at لو موجود)
create or replace function public.touch_leads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_leads_update_touch on public.leads;
create trigger on_leads_update_touch
  before update on public.leads
  for each row execute procedure public.touch_leads_updated_at();

-- سجل نسخ التعديلات (لقطة قبل كل تعديل)
create table if not exists public.lead_versions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  change_reason text not null default '',
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_versions_lead on public.lead_versions(lead_id, version desc);

alter table public.lead_versions enable row level security;
drop policy if exists internal_read_lead_versions on public.lead_versions;
create policy internal_read_lead_versions on public.lead_versions for select using (auth.uid() is not null);
drop policy if exists internal_write_lead_versions on public.lead_versions;
create policy internal_write_lead_versions on public.lead_versions for all using (auth.uid() is not null) with check (auth.uid() is not null);
