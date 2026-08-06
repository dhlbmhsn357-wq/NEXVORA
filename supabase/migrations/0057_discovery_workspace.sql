-- ============================================================
-- PM Operating System — 0057 Discovery Workspace (Multi Sessions)
--
-- بيحوّل الاكتشاف من "فورم واحد لكل مشروع" إلى "Workspace فيه جلسات
-- متعددة دائمة" — كل جلسة لها رابط عام خاص، استجابات خاصة، حالة خاصة
-- (مثلًا جلسة لكل إدارة في مشاريع ERP الكبيرة). كله متوافق خلفيًا: الرابط
-- والفورم الحاليين لكل مشروع بيتحوّلوا لجلسة واحدة تلقائيًا (الروابط تفضل
-- شغّالة). مفيش حذف تلقائي، مفيش استبدال.
-- ============================================================

-- 1) discovery_form_links = "جلسة اكتشاف". نشيل قيد "رابط واحد لكل مشروع"
--    ونضيف ميتاداتا الجلسة.
alter table public.discovery_form_links
  drop constraint if exists discovery_form_links_project_id_key;

alter table public.discovery_form_links
  add column if not exists session_name text,
  add column if not exists department text,
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_discovery_links_project_multi
  on public.discovery_form_links(project_id, created_at desc);

-- 2) discovery_forms (الاستجابات) = استجابات جلسة واحدة. نشيل قيد "فورم
--    واحد لكل مشروع" ونربطه بالجلسة (link_id).
alter table public.discovery_forms
  drop constraint if exists discovery_forms_project_id_key;

alter table public.discovery_forms
  add column if not exists link_id uuid references public.discovery_form_links(id) on delete cascade;

-- استجابة واحدة كحد أقصى لكل جلسة عامة (Partial — يسمح بفورم داخلي واحد
-- بلا link لكل مشروع كمان).
create unique index if not exists idx_discovery_forms_one_per_link
  on public.discovery_forms(link_id)
  where link_id is not null;

create index if not exists idx_discovery_forms_project_multi
  on public.discovery_forms(project_id);

-- 3) Backfill — كل فورم حالي يترتبط بجلسة المشروع الوحيدة الموجودة.
update public.discovery_forms f
  set link_id = l.id
  from public.discovery_form_links l
  where f.link_id is null
    and l.project_id = f.project_id;

-- 4) تسمية افتراضية للجلسات القديمة عشان تظهر بشكل لائق في المكتبة.
update public.discovery_form_links
  set session_name = 'الاكتشاف العام'
  where session_name is null;

-- ============================================================
-- انتهى 0057 Discovery Workspace
-- ============================================================
