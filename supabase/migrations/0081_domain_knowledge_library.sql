-- ============================================================
-- 0081 — مكتبة معرفة المجال ومحرّك دمج المعرفة
--        (Enterprise Domain Knowledge Library & Fusion Engine)
--
-- المرحلة الخامسة الموسّعة: خبرة قياسية تراكمية تُرجَّح مع معرفة المشروع.
--
-- **بناء فوق كل ما سبق لا إعادة تصميم.** معرفة المشروع (٠٠٧١/٠٠٧٧)
-- والخبرة العابرة للمشاريع (organizational_knowledge) والتعارضات
-- (knowledge_conflicts) والأوزان (retrieval/ranking) كلها موجودة. ده
-- بيضيف **نوعًا ثانيًا من المعرفة**: خبرة قياسية يؤلّفها المدير، غير
-- مرتبطة بمشروع، تُدمَج مع معرفة المشروع في نموذج واحد.
--
-- **آمن على البيانات:** جداول جديدة فقط. التراجع في
-- 0081_domain_knowledge_library_rollback.sql.
-- ============================================================


-- ============================================================
-- ١) حزم المجال — الخبرة القياسية لكل نوع نظام
--
-- كل حزمة = خبرة كاملة لمجال (ERP Enterprise، Hospital ERP...). غير
-- مرتبطة بمشروع؛ تمثّل «كيف يُبنى هذا النوع من الأنظمة عادةً».
-- ============================================================

create table if not exists public.domain_packages (
  id            uuid primary key default gen_random_uuid(),

  -- المجال — نصّ حر لا enum: مجالات جديدة بلا ترحيل (المواصفة تصرّ على
  -- الإضافة المستمرة دون تعديل الكود الأساسي).
  domain        text not null,
  name          text not null,
  description   text not null default '',

  status        text not null default 'draft'
    check (status in ('draft','published','archived')),

  -- درجات الجودة — محسوبة في الكود، مخزَّنة للعرض.
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  completeness  integer not null default 0 check (completeness between 0 and 100),
  coverage      integer not null default 0 check (coverage between 0 and 100),

  item_count    integer not null default 0,
  -- كم مشروعًا اختار هذه الحزمة — لتحليل الأكثر/الأقل استخدامًا.
  usage_count   integer not null default 0,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_domain_packages_domain
  on public.domain_packages (domain, status);


-- ============================================================
-- ٢) بنود الحزمة — المعرفة المرجعية المهيكلة
--
-- كل بند نوع مرجعي: وحدة، سير عمل، قاعدة عمل، مخاطرة، KPI، تكامل،
-- أمان، صلاحية، قسم، تقرير، نمط API/قاعدة بيانات/UX، أفضل ممارسة،
-- إجراء تشغيلي، سياسة، معمار.
-- ============================================================

create table if not exists public.domain_package_items (
  id            uuid primary key default gen_random_uuid(),
  package_id    uuid not null references public.domain_packages(id) on delete cascade,

  item_type     text not null
    check (item_type in (
      'module','workflow','business_rule','requirement','risk','kpi',
      'integration','security','permission','department','report',
      'api_pattern','db_pattern','ux_pattern','best_practice','sop',
      'policy','architecture','recommendation'
    )),
  title         text not null,
  content       text not null default '',
  -- تفاصيل مهيكلة خاصة بالنوع (خطوات سير العمل، شرط/نتيجة القاعدة...).
  detail        jsonb not null default '{}'::jsonb,
  importance    integer not null default 50 check (importance between 0 and 100),

  created_at    timestamptz not null default now()
);

create index if not exists idx_domain_package_items_package
  on public.domain_package_items (package_id, item_type);


-- ============================================================
-- ٣) أوزان الدمج — قوّة كل مصدر معرفة
--
-- ليس كل مصدر متساويًا: قرار العميل > قاعدة العمل > الاجتماع > المستند
-- > معيار المجال > أفضل ممارسة > اقتراح الذكاء الاصطناعي. قابلة للتعديل.
-- ============================================================

create table if not exists public.knowledge_fusion_weights (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null unique,
  weight        integer not null check (weight between 0 and 100),
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- الأوزان الافتراضية من المواصفة — آمنة لو اتكرّرت.
insert into public.knowledge_fusion_weights (source_type, weight)
values
  ('client_decision', 100),
  ('business_rule',    95),
  ('meeting',          90),
  ('document',         85),
  ('domain_standard',  80),
  ('best_practice',    75),
  ('ai_suggestion',    65)
on conflict (source_type) do nothing;


-- ============================================================
-- ٤) اختيار حزم المشروع — أي حزم يستخدمها مشروع
--
-- الذكاء بيختار الحزم المناسبة حسب مجال المشروع وطبيعته. كل صفّ = حزمة
-- مختارة لمشروع مع درجة الملاءمة ومصدر الاختيار.
-- ============================================================

create table if not exists public.project_domain_packages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  package_id    uuid not null references public.domain_packages(id) on delete cascade,

  relevance     integer not null default 50 check (relevance between 0 and 100),
  selected_by   text not null default 'auto' check (selected_by in ('auto','manual')),
  -- سبب الاختيار — للشفافية.
  rationale     text not null default '',

  created_at    timestamptz not null default now(),

  constraint project_domain_packages_unique unique (project_id, package_id)
);

create index if not exists idx_project_domain_packages_project
  on public.project_domain_packages (project_id);
create index if not exists idx_project_domain_packages_package
  on public.project_domain_packages (package_id);


-- ============================================================
-- ٥) أمان مستوى الصف
--
-- القراءة للمصادَقين؛ الكتابة للخدمة. الحوكمة الحقيقية (المدير وحده
-- يؤلّف الحزم) تُفرض في طبقة الخدمة بـ requireRole، مش هنا.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'domain_packages', 'domain_package_items',
    'knowledge_fusion_weights', 'project_domain_packages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
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
-- ٦) touch updated_at
-- ============================================================

drop trigger if exists on_domain_packages_touch on public.domain_packages;
create trigger on_domain_packages_touch before update on public.domain_packages
  for each row execute procedure public.touch_updated_at();


-- ============================================================
-- ٧) دالة: ملخّص المكتبة في استعلام واحد
-- ============================================================

create or replace function public.domain_library_summary()
returns table (
  total_packages    bigint,
  published_packages bigint,
  total_items       bigint,
  best_practices    bigint,
  workflows         bigint,
  benefiting_projects bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from domain_packages),
    (select count(*) from domain_packages where status = 'published'),
    (select count(*) from domain_package_items),
    (select count(*) from domain_package_items where item_type = 'best_practice'),
    (select count(*) from domain_package_items where item_type = 'workflow'),
    (select count(distinct project_id) from project_domain_packages);
$$;

grant execute on function public.domain_library_summary() to service_role, authenticated;
