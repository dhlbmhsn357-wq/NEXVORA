-- ============================================================
-- PM Operating System — 0020 Smart Discovery Engine
-- Dynamic Discovery Form Templates + Questions + seed data.
--
-- آمن للتشغيل أكثر من مرة (idempotent). شغّله كامل في Supabase SQL Editor.
-- لا يكسر أي شيء موجود: النموذج القديم (lib/discovery-form/questions.ts)
-- يفضل شغّال للمشاريع القديمة عبر fallback، والجداول القديمة ما اتلمستش.
-- ============================================================

-- ============================================================
-- 1) discovery_form_templates — قالب اكتشاف لكل نوع مشروع/مجال
-- ============================================================
create table if not exists public.discovery_form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  industry text,
  icon text,
  is_default boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discovery_templates_status
  on public.discovery_form_templates(status);
create index if not exists idx_discovery_templates_sort
  on public.discovery_form_templates(sort_order);

-- ============================================================
-- 2) discovery_questions — أسئلة كل قالب
--    ملاحظة: العمود اسمه sort_order (مش "order" لأنها كلمة محجوزة في SQL).
-- ============================================================
create table if not exists public.discovery_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.discovery_form_templates(id) on delete cascade,
  question text not null,
  description text,
  type text not null default 'short_text'
    check (type in (
      'short_text', 'long_text', 'yes_no', 'multiple_choice', 'checkbox',
      'rating', 'number', 'website', 'email', 'phone', 'date',
      'file_upload', 'logo_upload', 'document_upload'
    )),
  required boolean not null default false,
  placeholder text,
  options jsonb not null default '[]'::jsonb,
  help_text text,
  sort_order int not null default 0,
  ai_weight numeric not null default 1,
  category text,
  -- قواعد التحقق: { "maxLength": int, "allowedFileTypes": ["pdf"], "maxFileSizeMb": int }
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discovery_questions_template
  on public.discovery_questions(template_id);
create index if not exists idx_discovery_questions_sort
  on public.discovery_questions(template_id, sort_order);

-- ============================================================
-- 3) أعمدة إضافية (Additive) — كلها nullable وما تكسرش أي شيء قائم
-- ============================================================

-- أي قالب اكتشاف مرتبط بالمشروع (يُشتق من الـ Lead عند التحويل، وقابل للتغيير يدويًا)
alter table public.projects
  add column if not exists discovery_template_id uuid references public.discovery_form_templates(id) on delete set null;

-- نوع المشروع/القالب المختار عند إنشاء الـ Lead
alter table public.leads
  add column if not exists discovery_template_id uuid references public.discovery_form_templates(id) on delete set null;

-- ربط الفورم المُعبّأ بالقالب المستخدم + لقطة ثابتة من الأسئلة
alter table public.discovery_forms
  add column if not exists template_id uuid references public.discovery_form_templates(id) on delete set null;

-- لقطة الأسئلة وقت التسليم: [{ "key": "<question id>", "label": "...", "type": "...", "category": "...", "order": n }]
-- تُخزَّن عشان تلخيص الـ AI وعرض الإجابات يفضلوا صحيحين حتى لو القالب اتعدّل/اتحذف بعدين.
alter table public.discovery_forms
  add column if not exists questions_snapshot jsonb;

alter table public.discovery_forms
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- 4) RLS — نفس سياسة Phase 1 المبسطة (أي مستخدم داخلي مسجّل دخول)
-- ============================================================
alter table public.discovery_form_templates enable row level security;
alter table public.discovery_questions enable row level security;

drop policy if exists "internal_read_discovery_templates" on public.discovery_form_templates;
create policy "internal_read_discovery_templates" on public.discovery_form_templates
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_discovery_templates" on public.discovery_form_templates;
create policy "internal_write_discovery_templates" on public.discovery_form_templates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "internal_read_discovery_questions" on public.discovery_questions;
create policy "internal_read_discovery_questions" on public.discovery_questions
  for select using (auth.uid() is not null);

drop policy if exists "internal_write_discovery_questions" on public.discovery_questions;
create policy "internal_write_discovery_questions" on public.discovery_questions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 5) Storage bucket لرفع الملفات/الشعارات/المستندات داخل الاكتشاف
-- ============================================================
insert into storage.buckets (id, name, public)
values ('discovery-uploads', 'discovery-uploads', false)
on conflict (id) do nothing;

drop policy if exists "discovery_uploads_auth_all" on storage.objects;
create policy "discovery_uploads_auth_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'discovery-uploads')
  with check (bucket_id = 'discovery-uploads');

-- ============================================================
-- 6) updated_at تلقائي للقوالب والأسئلة والفورم
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_discovery_templates_touch on public.discovery_form_templates;
create trigger on_discovery_templates_touch
  before update on public.discovery_form_templates
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_discovery_questions_touch on public.discovery_questions;
create trigger on_discovery_questions_touch
  before update on public.discovery_questions
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_discovery_forms_touch on public.discovery_forms;
create trigger on_discovery_forms_touch
  before update on public.discovery_forms
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 7) Seed — 10 قوالب + أسئلة (15 عام + متخصصة لكل مجال)
--    البذر يحدث مرة واحدة فقط: لو القالب موجود بالفعل بأسئلة، يتخطاه
--    عشان ما يمسحش أي تعديلات عملها الأدمن لاحقًا.
-- ============================================================
do $$
declare
  v_generic jsonb := $json$[
    {"q":"ما نشاط شركتك أو مشروعك؟","t":"long_text","c":"عن نشاطك","r":true,"h":"اشرح باختصار طبيعة عملك والخدمات أو المنتجات اللي بتقدمها."},
    {"q":"ما المشكلة الأساسية اللي بتحاول تحلّها بالمشروع ده؟","t":"long_text","c":"عن نشاطك","r":true,"h":"ركّز على المشكلة الحقيقية من وجهة نظر العميل، مش الحل التقني."},
    {"q":"مين جمهورك المستهدف بالظبط؟","t":"long_text","c":"عن نشاطك","r":true,"h":"مثلاً: أصحاب شركات صغيرة، طلاب، أمهات جدد… كل ما كنت محدد أكتر كل ما كان أفضل."},
    {"q":"بتدير الشغل ده إزاي حاليًا (قبل المشروع)؟","t":"long_text","c":"عن نشاطك","r":false,"h":"الأدوات أو الطريقة الحالية حتى لو يدوية (واتساب، إكسل، دفتر…)."},
    {"q":"مين أبرز المنافسين أو البدائل المتاحة لعملائك؟","t":"long_text","c":"عن نشاطك","r":false},
    {"q":"إيه اللي هيميّزك عن المنافسين؟","t":"long_text","c":"عن نشاطك","r":false,"h":"الميزة اللي تخلي العميل يختارك انت بالذات."},
    {"q":"ليه بتعمل المشروع ده دلوقتي بالتحديد؟","t":"long_text","c":"أهداف المشروع","r":true,"h":"الدافع أو الحدث اللي خلّاك تبدأ الآن."},
    {"q":"إيه أهم 3 أهداف عايز المشروع يحققها؟","t":"long_text","c":"أهداف المشروع","r":true},
    {"q":"هتقيس نجاح المشروع إزاي بعد الإطلاق؟","t":"long_text","c":"أهداف المشروع","r":true,"h":"مثلاً: عدد العملاء، وقت أقل في مهمة معينة، زيادة مبيعات…"},
    {"q":"إيه أكتر حاجة بتقلقك في المشروع ده؟","t":"long_text","c":"أهداف المشروع","r":false},
    {"q":"فيه أمثلة أو مواقع/تطبيقات بتعجبك وتحب نستوحي منها؟","t":"long_text","c":"أهداف المشروع","r":false,"h":"روابط أو أسماء، مع ذكر إيه اللي عاجبك فيها تحديدًا."},
    {"q":"الميزانية التقريبية المتاحة للمشروع؟","t":"short_text","c":"الجاهزية والميزانية","r":false,"p":"مثلاً: 50–80 ألف"},
    {"q":"إمتى محتاج المشروع يكون جاهز للإطلاق؟","t":"short_text","c":"الجاهزية والميزانية","r":false,"p":"مثلاً: خلال 3 شهور"},
    {"q":"عندك هوية بصرية جاهزة (لوجو، ألوان، خطوط)؟","t":"yes_no","c":"الجاهزية والميزانية","r":false},
    {"q":"المحتوى (نصوص، صور، بيانات) جاهز ولا محتاج نساعدك فيه؟","t":"long_text","c":"الجاهزية والميزانية","r":false}
  ]$json$;

  v_specialized jsonb := $json${
    "educational": [
      {"q":"إيه أنواع الكورسات أو المواد اللي هتقدّمها؟","t":"long_text","c":"تفاصيل المنصة التعليمية","r":true},
      {"q":"هيكون فيه معلمين/مدرّبين متعددين على المنصة؟","t":"yes_no","c":"تفاصيل المنصة التعليمية"},
      {"q":"محتاج حصص مباشرة (Live) ولا فيديوهات مسجّلة ولا الاتنين؟","t":"multiple_choice","c":"تفاصيل المنصة التعليمية","o":["مباشرة فقط","مسجّلة فقط","الاتنين معًا"]},
      {"q":"محتاج شهادات إتمام للطلاب؟","t":"yes_no","c":"تفاصيل المنصة التعليمية"},
      {"q":"عايز تتبّع تقدّم الطالب ودرجاته؟","t":"yes_no","c":"تفاصيل المنصة التعليمية"},
      {"q":"اوصف رحلة الطالب المثالية من التسجيل لإتمام الكورس.","t":"long_text","c":"تفاصيل المنصة التعليمية"},
      {"q":"هيكون فيه اختبارات أو واجبات؟","t":"yes_no","c":"تفاصيل المنصة التعليمية"}
    ],
    "marketing": [
      {"q":"إيه الخدمات التسويقية اللي بتقدّمها الوكالة؟","t":"long_text","c":"تفاصيل الوكالة التسويقية","r":true},
      {"q":"محتاج تعرض دراسات حالة/أعمال سابقة (Portfolio)؟","t":"yes_no","c":"تفاصيل الوكالة التسويقية"},
      {"q":"عايز نظام لإدارة العملاء والحملات من مكان واحد؟","t":"yes_no","c":"تفاصيل الوكالة التسويقية"},
      {"q":"محتاج تتبّع أداء الحملات والتحليلات (Analytics)؟","t":"yes_no","c":"تفاصيل الوكالة التسويقية"},
      {"q":"هتحتاج تكامل مع منصّات إعلانات (Meta, Google)؟","t":"yes_no","c":"تفاصيل الوكالة التسويقية"},
      {"q":"عايز تبني قمع تسويقي (Funnel) لجذب العملاء؟","t":"yes_no","c":"تفاصيل الوكالة التسويقية"}
    ],
    "erp": [
      {"q":"إيه الأقسام/الإدارات اللي محتاج النظام يغطّيها؟","t":"long_text","c":"تفاصيل نظام ERP","r":true},
      {"q":"اوصف أهم Workflow يومي محتاج النظام يأتمته.","t":"long_text","c":"تفاصيل نظام ERP","r":true},
      {"q":"محتاج مستويات صلاحيات مختلفة للمستخدمين؟","t":"yes_no","c":"تفاصيل نظام ERP"},
      {"q":"محتاج إدارة مخزون (Inventory)؟","t":"yes_no","c":"تفاصيل نظام ERP"},
      {"q":"محتاج وحدة مالية/محاسبة؟","t":"yes_no","c":"تفاصيل نظام ERP"},
      {"q":"محتاج وحدة موارد بشرية (HR)؟","t":"yes_no","c":"تفاصيل نظام ERP"},
      {"q":"إيه التقارير الأهم اللي محتاج النظام يطلّعها؟","t":"long_text","c":"تفاصيل نظام ERP"}
    ],
    "saas": [
      {"q":"اوصف الفكرة الأساسية للمنتج في جملة أو جملتين.","t":"long_text","c":"تفاصيل SaaS","r":true},
      {"q":"إيه نموذج التسعير المتوقع (اشتراك شهري، حسب الاستخدام…)؟","t":"short_text","c":"تفاصيل SaaS"},
      {"q":"المنتج محتاج يخدم عدة شركات مستقلة (Multi-tenant)؟","t":"yes_no","c":"تفاصيل SaaS"},
      {"q":"محتاج تكامل مع نظام دفع/فوترة؟","t":"yes_no","c":"تفاصيل SaaS"},
      {"q":"العدد المتوقّع للمستخدمين في أول سنة؟","t":"short_text","c":"تفاصيل SaaS"},
      {"q":"إيه أهم ميزة لازم تكون موجودة في أول إصدار؟","t":"long_text","c":"تفاصيل SaaS"}
    ],
    "corporate": [
      {"q":"إيه الانطباع اللي عايز الموقع يوصّله عن شركتك؟","t":"long_text","c":"تفاصيل موقع الشركة","r":true},
      {"q":"إيه الصفحات الأساسية المطلوبة؟","t":"long_text","c":"تفاصيل موقع الشركة","h":"مثلاً: الرئيسية، من نحن، الخدمات، تواصل معنا…"},
      {"q":"محتاج مدونة أو قسم أخبار؟","t":"yes_no","c":"تفاصيل موقع الشركة"},
      {"q":"محتاج الموقع بأكتر من لغة؟","t":"yes_no","c":"تفاصيل موقع الشركة"},
      {"q":"محتاج لوحة تحكم تعدّل المحتوى بنفسك؟","t":"yes_no","c":"تفاصيل موقع الشركة"},
      {"q":"إيه الإجراء اللي عايز الزائر يعمله (اتصال، طلب عرض سعر…)؟","t":"short_text","c":"تفاصيل موقع الشركة"}
    ],
    "ecommerce": [
      {"q":"إيه نوع المنتجات اللي هتبيعها؟","t":"long_text","c":"تفاصيل المتجر الإلكتروني","r":true},
      {"q":"عدد المنتجات التقريبي في البداية؟","t":"number","c":"تفاصيل المتجر الإلكتروني"},
      {"q":"إيه طرق الدفع المطلوبة؟","t":"long_text","c":"تفاصيل المتجر الإلكتروني","h":"مثلاً: بطاقة، دفع عند الاستلام، محافظ إلكترونية…"},
      {"q":"هتشحن لمناطق محددة ولا كل البلد/العالم؟","t":"short_text","c":"تفاصيل المتجر الإلكتروني"},
      {"q":"محتاج نظام كوبونات وعروض؟","t":"yes_no","c":"تفاصيل المتجر الإلكتروني"},
      {"q":"محتاج تكامل مع شركات شحن؟","t":"yes_no","c":"تفاصيل المتجر الإلكتروني"},
      {"q":"محتاج إدارة مخزون المنتجات؟","t":"yes_no","c":"تفاصيل المتجر الإلكتروني"}
    ],
    "clinic": [
      {"q":"إيه التخصصات أو الخدمات الطبية المقدّمة؟","t":"long_text","c":"تفاصيل العيادة","r":true},
      {"q":"محتاج نظام حجز مواعيد أونلاين؟","t":"yes_no","c":"تفاصيل العيادة"},
      {"q":"محتاج ملفات مرضى إلكترونية؟","t":"yes_no","c":"تفاصيل العيادة"},
      {"q":"فيه أكتر من طبيب/فرع؟","t":"yes_no","c":"تفاصيل العيادة"},
      {"q":"محتاج تذكير المرضى بالمواعيد (SMS/واتساب)؟","t":"yes_no","c":"تفاصيل العيادة"},
      {"q":"محتاج نظام فوترة ومدفوعات؟","t":"yes_no","c":"تفاصيل العيادة"}
    ],
    "realestate": [
      {"q":"بتتعامل مع بيع، إيجار، ولا الاتنين؟","t":"multiple_choice","c":"تفاصيل العقارات","r":true,"o":["بيع","إيجار","الاتنين معًا"]},
      {"q":"عدد العقارات/الوحدات التقريبي المعروض؟","t":"number","c":"تفاصيل العقارات"},
      {"q":"محتاج خرائط وبحث حسب الموقع؟","t":"yes_no","c":"تفاصيل العقارات"},
      {"q":"محتاج جولات افتراضية أو معارض صور للوحدات؟","t":"yes_no","c":"تفاصيل العقارات"},
      {"q":"محتاج نظام لإدارة العملاء المهتمين (Leads)؟","t":"yes_no","c":"تفاصيل العقارات"},
      {"q":"فيه مسوّقين/وسطاء متعددين على المنصة؟","t":"yes_no","c":"تفاصيل العقارات"}
    ],
    "restaurant": [
      {"q":"إيه نوع المطعم والمطبخ اللي بتقدّمه؟","t":"long_text","c":"تفاصيل المطعم","r":true},
      {"q":"محتاج قائمة طعام (Menu) رقمية؟","t":"yes_no","c":"تفاصيل المطعم"},
      {"q":"محتاج طلبات أونلاين وتوصيل؟","t":"yes_no","c":"تفاصيل المطعم"},
      {"q":"محتاج حجز طاولات؟","t":"yes_no","c":"تفاصيل المطعم"},
      {"q":"فيه أكتر من فرع؟","t":"yes_no","c":"تفاصيل المطعم"},
      {"q":"محتاج تكامل مع تطبيقات توصيل موجودة؟","t":"yes_no","c":"تفاصيل المطعم"}
    ],
    "other": []
  }$json$;

  v_templates jsonb := $json$[
    {"slug":"educational","name":"منصة تعليمية","industry":"التعليم","icon":"GraduationCap","desc":"منصات الكورسات والتعليم الإلكتروني والحصص المباشرة.","default":false,"sort":1},
    {"slug":"marketing","name":"وكالة تسويق","industry":"التسويق","icon":"Megaphone","desc":"وكالات التسويق الرقمي وإدارة الحملات والمحتوى.","default":false,"sort":2},
    {"slug":"erp","name":"نظام ERP","industry":"الأنظمة المؤسسية","icon":"Building2","desc":"أنظمة إدارة موارد المؤسسات الداخلية.","default":false,"sort":3},
    {"slug":"saas","name":"منتج SaaS","industry":"البرمجيات","icon":"Cloud","desc":"منتجات البرمجيات كخدمة باشتراك.","default":false,"sort":4},
    {"slug":"corporate","name":"موقع شركة","industry":"مواقع الشركات","icon":"Globe","desc":"المواقع التعريفية للشركات والمؤسسات.","default":false,"sort":5},
    {"slug":"ecommerce","name":"متجر إلكتروني","industry":"التجارة الإلكترونية","icon":"ShoppingCart","desc":"متاجر بيع المنتجات أونلاين.","default":false,"sort":6},
    {"slug":"clinic","name":"عيادة / مركز طبي","industry":"الرعاية الصحية","icon":"Stethoscope","desc":"العيادات والمراكز الطبية وحجز المواعيد.","default":false,"sort":7},
    {"slug":"realestate","name":"عقارات","industry":"العقارات","icon":"Home","desc":"منصات بيع وإيجار العقارات.","default":false,"sort":8},
    {"slug":"restaurant","name":"مطعم","industry":"المطاعم","icon":"UtensilsCrossed","desc":"المطاعم والقوائم الرقمية والطلبات أونلاين.","default":false,"sort":9},
    {"slug":"other","name":"مشروع آخر","industry":"عام","icon":"Sparkles","desc":"أي نوع مشروع آخر — الأسئلة الأساسية فقط.","default":true,"sort":10}
  ]$json$;

  v_tpl jsonb;
  v_q jsonb;
  v_tpl_id uuid;
  v_order int;
  v_slug text;
begin
  -- إنشاء القوالب (مرة واحدة، ما يكسرش الموجود)
  for v_tpl in select * from jsonb_array_elements(v_templates)
  loop
    insert into public.discovery_form_templates (slug, name, industry, icon, description, is_default, sort_order)
    values (
      v_tpl->>'slug', v_tpl->>'name', v_tpl->>'industry', v_tpl->>'icon',
      v_tpl->>'desc', (v_tpl->>'default')::boolean, (v_tpl->>'sort')::int
    )
    on conflict (slug) do nothing;
  end loop;

  -- بذر الأسئلة لكل قالب — فقط لو القالب لسه من غير أسئلة
  for v_tpl in select * from jsonb_array_elements(v_templates)
  loop
    v_slug := v_tpl->>'slug';
    select id into v_tpl_id from public.discovery_form_templates where slug = v_slug;
    if v_tpl_id is null then continue; end if;
    if exists (select 1 from public.discovery_questions where template_id = v_tpl_id) then
      continue;
    end if;

    v_order := 0;

    -- الأسئلة العامة (15) — نفسها لكل القوالب
    for v_q in select * from jsonb_array_elements(v_generic)
    loop
      v_order := v_order + 1;
      insert into public.discovery_questions
        (template_id, question, type, category, sort_order, required, options, help_text, placeholder)
      values (
        v_tpl_id, v_q->>'q', v_q->>'t', v_q->>'c', v_order,
        coalesce((v_q->>'r')::boolean, false),
        coalesce(v_q->'o', '[]'::jsonb),
        v_q->>'h', v_q->>'p'
      );
    end loop;

    -- الأسئلة المتخصصة حسب المجال
    for v_q in select * from jsonb_array_elements(coalesce(v_specialized->v_slug, '[]'::jsonb))
    loop
      v_order := v_order + 1;
      insert into public.discovery_questions
        (template_id, question, type, category, sort_order, required, options, help_text, placeholder)
      values (
        v_tpl_id, v_q->>'q', v_q->>'t', v_q->>'c', v_order,
        coalesce((v_q->>'r')::boolean, false),
        coalesce(v_q->'o', '[]'::jsonb),
        v_q->>'h', v_q->>'p'
      );
    end loop;
  end loop;
end $$;

-- ============================================================
-- انتهى 0020 Smart Discovery Engine
-- ============================================================
