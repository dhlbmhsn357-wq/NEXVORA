-- ============================================================================
-- 0124 — حزمة المنتج القياسية (Standard Product Package) — المرحلة ب:
-- طلبات تغيير العميل (Client Change Requests) + تحليل الأثر بالذكاء الاصطناعي
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- السياق: بعد استنساخ Client Variant (المرحلة أ، 0123)، المستخدم بيسجّل
-- بس الفروقات الخاصة بالعميل ده كطلبات تغيير صغيرة وصريحة (إضافة/تعديل/
-- حذف) — مش إعادة Discovery كاملة. كل طلب تغيير بياخد تحليل أثر بالذكاء
-- الاصطناعي (أي عناصر منتج متأثرة وإزاي)، المستخدم بيراجع المقترح
-- ويعتمده، وبعدين بس العناصر المتأثرة فعليًا بتتحدّث (مش إعادة توليد
-- كاملة) — عن طريق versioning الموجود بالفعل لكل نطاق.
--
-- ضمان أساسي غير قابل للتفاوض: الذكاء الاصطناعي أبدًا ما بيكتبش مباشرة في
-- "حقيقة المنتج" (Product Truth). تحليل الأثر (runImpactAnalysis) بيُنتج
-- فقط صفوف change_impacts بحالة 'proposed' — لا يمسّ أي جدول بيانات منتج
-- حقيقي إطلاقًا. الكتابة الفعلية بتحصل بس في applyApprovedImpacts، بعد
-- موافقة بشرية صريحة.
--
-- ملاحظات معمارية ثابتة (مطابقة تمامًا لـ 0113-0123):
--   - single-tenant، لا يوجد عمود workspace_id في أي مكان.
--   - RLS مفتوح لأي مستخدم مسجّل دخول (auth.uid() is not null) — المنع
--     الفعلي حسب الدور في lib/auth/rbac.ts::requireRole داخل كل Server
--     Action فقط، مش في RLS.
-- ============================================================================

-- ============================================================
-- 1) client_change_requests — طلب تغيير واحد مسجَّل من المستخدم عن مشروع
-- Client Variant. type/status هما دورة حياة الطلب نفسه (مش التحليل).
-- ============================================================
create table if not exists public.client_change_requests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  type          text not null check (type in ('add', 'modify', 'remove')),
  title         text not null,
  description   text not null default '',

  -- سياق اختياري: من أين جاء الطلب (اجتماع/فورم/ملاحظة يدوية...) — نص حر
  -- عن قصد، لا تخترع enum مقفول هنا؛ المصادر ممكن تتوسّع بحرية بمرور
  -- الوقت (اجتماع، Brain entry، طلب عميل مباشر...) بلا هجرة جديدة لكل
  -- مصدر جديد.
  source_type   text,
  source_id     uuid,

  status        text not null default 'draft'
    check (status in ('draft', 'analyzing', 'needs_review', 'approved', 'applied', 'rejected')),

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 2) change_impacts — عنصر تحليل أثر واحد، نتيجة تشغيل الذكاء الاصطناعي
-- على طلب تغيير. كل صف = "هذا الـ artifact متأثر بهذه الطريقة، وهذا هو
-- التعديل المقترح".
-- ============================================================
create table if not exists public.change_impacts (
  id                  uuid primary key default gen_random_uuid(),
  change_request_id   uuid not null references public.client_change_requests(id) on delete cascade,

  -- نص حر يطابق object_type/domain الأنواع الموجودة فعليًا في المشروع
  -- (requirement/user_story/acceptance_criteria/business_rule/
  -- system_message/persona/user_flow/state_machine/prd_section/decision)
  -- — عمدًا مش enum مقفول جديد يتصادم مع knowledge_memory.object_type أو
  -- يحتاج هجرة كل ما اتضاف نطاق جديد.
  artifact_type       text not null,

  -- nullable: لعنصر جديد مقترح (impact_type='add') لسه معندوش id حقيقي
  -- في جدول المنتج المستهدف.
  artifact_id         uuid,

  -- تسمية معروضة (مثال: "US-19"، "PRD §6.3") — بدل ما نعرض IDs خام في
  -- الواجهة لاحقًا.
  artifact_label      text not null default '',

  impact_type         text not null check (impact_type in ('add', 'modify', 'remove')),
  reason              text not null default '',

  -- التعديل المقترح — jsonb مُهيكل عمدًا، **مش نص حر بالكامل**. شكله
  -- يعتمد على artifact_type (مثلًا لـ business_rule: {title, triggerCondition,
  -- ...} بس الحقول اللي فعلًا بتتغيّر). السبب: خطوة "تحديث الأقسام
  -- المتأثرة فقط فقط" (apply-changes-service.ts) لازم تقدر تستهلك القيمة
  -- دي برمجيًا وتمررها مباشرة لدوال update* الموجودة — نص حر كان
  -- هيحتاج parsing/تفسير إضافي غير موثوق وقت التطبيق الفعلي على البيانات.
  proposed_change     jsonb not null default '{}'::jsonb,

  -- تعارضات/اعتماديات مكتشفة بين هذا الأثر وأثر تاني (نص حر لكل عنصر —
  -- شرح، مش مرجع مهيكل، لأن "الاعتمادية" هنا وصفية للمراجعة البشرية).
  dependencies        jsonb not null default '[]'::jsonb,

  missing_information text not null default '',

  status              text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'applied')),

  created_at          timestamptz not null default now()
);

create index if not exists idx_client_change_requests_project on public.client_change_requests(project_id, status);
create index if not exists idx_change_impacts_request on public.change_impacts(change_request_id);

-- ============================================================
-- Row Level Security — نفس نمط 0001/0113/0120/0122/0123.
-- ============================================================
alter table public.client_change_requests enable row level security;
alter table public.change_impacts enable row level security;

drop policy if exists internal_read_client_change_requests on public.client_change_requests;
create policy internal_read_client_change_requests on public.client_change_requests
  for select using (auth.uid() is not null);

drop policy if exists internal_write_client_change_requests on public.client_change_requests;
create policy internal_write_client_change_requests on public.client_change_requests
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists internal_read_change_impacts on public.change_impacts;
create policy internal_read_change_impacts on public.change_impacts
  for select using (auth.uid() is not null);

drop policy if exists internal_write_change_impacts on public.change_impacts;
create policy internal_write_change_impacts on public.change_impacts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- updated_at trigger لـ client_change_requests (نفس الدالة الموجودة touch_updated_at).
-- change_impacts مالوش updated_at — كل تغيير حالة (proposed→approved→applied)
-- بيتسجّل كصف واحد ثابت، مفيش تعديل رجعي على محتواه بعد إنشائه.
-- ============================================================
drop trigger if exists on_client_change_requests_touch on public.client_change_requests;
create trigger on_client_change_requests_touch
  before update on public.client_change_requests
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 3) إعداد النموذج لمهمة تحليل أثر التغيير (standard_change_impact_analysis)
-- نفس نمط 0119: أي نوع مهمة جديد بيتضاف في الكود محتاج صف هنا وإلا
-- AIService بيرجع لإعداد افتراضي غير متحكَّم فيه من الإعدادات لحد ما
-- الهجرة دي تتطبّق. gemini-3.5-flash هو نفس الموديل المستخدم في
-- project_assistant_qa (0119) وأغلب مهام JSON المهيكل الحديثة في المشروع.
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('standard_change_impact_analysis', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================================
-- انتهت 0124
-- ============================================================================
