-- ============================================================
-- PM Operating System — Phase 1 Schema
-- Auth + Clients/Contacts/Leads/Projects + Discovery Form + Brain + Audit
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

-- ---------- إعدادات عامة ----------
create extension if not exists "pgcrypto"; -- لتوليد uuid

-- ============================================================
-- 1) profiles — مرتبط تلقائيًا بـ auth.users
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now()
);

-- إنشاء profile تلقائي عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2) clients
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  industry text,
  website text,
  country text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3) contacts
-- ============================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  whatsapp text,
  language text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_client on public.contacts(client_id);

-- ============================================================
-- 4) projects (يُنشأ أولاً بدون FK على leads لتفادي تبعية دائرية،
--    سنضيف عمود lead_id بعد إنشاء جدول leads)
-- ============================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid, -- سيُضاف عليه FK بعد إنشاء جدول leads
  name text not null,
  project_type text not null default 'other'
    check (project_type in ('website','mobile_app','saas','dashboard','other')),
  stage text not null default 'lead',
  owner_id uuid references public.profiles(id) on delete set null,
  price numeric,
  currency text not null default 'SAR',
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid')),
  created_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now()
);

create index if not exists idx_projects_client on public.projects(client_id);
create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_projects_stage on public.projects(stage);

-- ============================================================
-- 5) leads
-- ============================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  source text,
  status text not null default 'new'
    check (status in ('new','contacted','qualified','converted','lost')),
  owner_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  converted_to_project_id uuid references public.projects(id) on delete set null
);

create index if not exists idx_leads_client on public.leads(client_id);
create index if not exists idx_leads_owner on public.leads(owner_id);
create index if not exists idx_leads_status on public.leads(status);

-- الآن نضيف الـ FK المؤجل من projects إلى leads
alter table public.projects
  add constraint fk_projects_lead
  foreign key (lead_id) references public.leads(id) on delete set null;

-- ============================================================
-- 6) discovery_forms (فورم واحد لكل مشروع، إجابات ديناميكية jsonb)
-- ============================================================
create table if not exists public.discovery_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft','sent','submitted')),
  sent_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7) project_brain_entries
-- ============================================================
create table if not exists public.project_brain_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_type text not null default 'note'
    check (entry_type in ('note','decision','link','risk','question')),
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_brain_project on public.project_brain_entries(project_id);

-- ============================================================
-- 8) audit_log
-- ============================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create','update','delete','stage_change')),
  changes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_entity on public.audit_log(entity_type, entity_id);

-- ============================================================
-- Row Level Security (RLS)
-- سياسة Phase 1 المبسطة: أي مستخدم مُسجّل دخوله (عضو داخلي في الفريق)
-- يقدر يشوف ويعدّل كل حاجة. هذا مقصود لأن الفريق كله داخلي (حتى 10
-- أشخاص). الجاهزية للتوسع لاحقًا (مثل عميل يشوف مشروعه فقط) هتتضاف
-- كسياسات إضافية فوق نفس الجداول دون كسر أي شيء موجود.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.projects enable row level security;
alter table public.discovery_forms enable row level security;
alter table public.project_brain_entries enable row level security;
alter table public.audit_log enable row level security;

-- أي مستخدم داخلي (عنده صف في profiles) يقدر يقرأ كل الجداول
create policy "internal_read_profiles" on public.profiles
  for select using (auth.uid() is not null);

create policy "internal_read_clients" on public.clients
  for select using (auth.uid() is not null);
create policy "internal_write_clients" on public.clients
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_contacts" on public.contacts
  for select using (auth.uid() is not null);
create policy "internal_write_contacts" on public.contacts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_leads" on public.leads
  for select using (auth.uid() is not null);
create policy "internal_write_leads" on public.leads
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_projects" on public.projects
  for select using (auth.uid() is not null);
create policy "internal_write_projects" on public.projects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_discovery_forms" on public.discovery_forms
  for select using (auth.uid() is not null);
create policy "internal_write_discovery_forms" on public.discovery_forms
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_brain" on public.project_brain_entries
  for select using (auth.uid() is not null);
create policy "internal_write_brain" on public.project_brain_entries
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_audit" on public.audit_log
  for select using (auth.uid() is not null);
create policy "internal_write_audit" on public.audit_log
  for insert with check (auth.uid() is not null);

-- ============================================================
-- تحديث stage_changed_at تلقائيًا عند تغيير مرحلة المشروع
-- ============================================================
create or replace function public.update_stage_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_project_stage_change on public.projects;
create trigger on_project_stage_change
  before update on public.projects
  for each row execute procedure public.update_stage_changed_at();

-- ============================================================
-- انتهى Phase 1 Schema
-- ============================================================
