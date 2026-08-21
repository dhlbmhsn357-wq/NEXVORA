-- ============================================================================
-- 0125 — حزمة المنتج القياسية (Standard Product Package) — المرحلة ج:
-- Prompt تغيير الـ Prototype + علم إعادة تجميع الـ Handoff + بنية تعلّم
-- الـ Standard الأساسية
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- السياق: بعد ما change_impacts المعتمَدة بتتطبّق فعليًا على بيانات المنتج
-- (apply-changes-service.ts::applyApprovedImpacts، المرحلة ب)، المستخدم
-- محتاج:
--   1) Prompt عملي ومختصر يلصقه في أداة الـ Prototype الخارجية (Google
--      Stitch/Figma Make/Codex/Claude Code/Bolt) يعكس **فقط** التغيير
--      المعتمَد اللي اتطبّق فعلًا — مش إعادة توليد الـ Prototype كله.
--   2) تنبيه إن حزمة الـ Handoff (لو موجودة) بقت "محتاجة إعادة تجميع"
--      لأن بيانات المنتج اتغيّرت بعد آخر تجميع ليها.
--   3) بذرة بيانات خفيفة قابلة للاستعلام لاحقًا: "إزاي التغييرات دي بتتكرر
--      عبر عملاء نفس الـ Sector Standard" — بدون أي واجهة تحليلات في هذه
--      المرحلة، مجرد بيانات مُهيّأة صح لمرحلة قادمة تستهلكها.
--
-- ملاحظات معمارية ثابتة (مطابقة تمامًا لـ 0113-0124):
--   - single-tenant، لا يوجد عمود workspace_id في أي مكان.
--   - RLS مفتوح لأي مستخدم مسجّل دخول (auth.uid() is not null) — المنع
--     الفعلي حسب الدور في lib/auth/rbac.ts::requireRole داخل كل Server
--     Action فقط، مش في RLS.
-- ============================================================================

-- ============================================================
-- 1) prototype_change_prompts — Prompt واحد مولَّد لكل طلب تغيير (أو دفعة
-- من الأثر المُطبَّق)، يحمل النص اللي المستخدم بينسخه لأداة الـ Prototype
-- الخارجية. للـ Prompt أبدًا مايكتبش على بيانات المنتج — بيُقرأ منها بس.
-- ============================================================
create table if not exists public.prototype_change_prompts (
  id                  uuid primary key default gen_random_uuid(),
  change_request_id   uuid not null references public.client_change_requests(id) on delete cascade,

  prompt_text         text not null,

  -- تلميح نصي حر اختياري لأداة الـ Prototype المستهدفة —
  -- 'google_stitch'|'figma_make'|'codex'|'claude_code'|'bolt'|'generic'
  -- نص حر عمدًا، مش enum مقفول (نفس فلسفة change_impacts.artifact_type:
  -- الأدوات المتاحة بتتوسّع بمرور الوقت من غير هجرة جديدة لكل أداة).
  prototype_tool      text,

  generated_at        timestamptz not null default now(),
  generated_by        uuid references public.profiles(id) on delete set null
);

create index if not exists idx_prototype_change_prompts_request on public.prototype_change_prompts(change_request_id);

-- ============================================================
-- تفضيل اختياري لأداة الـ Prototype على مستوى المشروع نفسه (يُستخدم
-- كقيمة افتراضية عند توليد Prompt جديد لو المستخدم ما حددّش أداة صراحةً).
-- ============================================================
alter table public.projects
  add column if not exists preferred_prototype_tool text;

-- ============================================================
-- 2) standard_learning_signals — بذرة تعلّم Standard خفيفة: صف واحد لكل
-- أثر تغيير **مُطبَّق فعليًا** (change_impacts.status='applied')، denormalized
-- بالقدر الكافي عشان يتجمّع لاحقًا حسب standard_project_id + artifact_type
-- + impact_type + change_type من غير ما نعمل join عبر 4 جداول كل مرة.
-- مش لوحة تحليلات في هذه المرحلة — مجرد ضمان إن البيانات موجودة ومهيّأة
-- صح لمرحلة قادمة تستهلكها (مثلاً: "التغيير ده اتكرر عند X عميل من
-- عملاء نفس الـ Standard — يستاهل يترقّى للـ Standard نفسه").
-- ============================================================
create table if not exists public.standard_learning_signals (
  id                   uuid primary key default gen_random_uuid(),

  -- nullable: لو standard_project_id اتمسح بعدين (on delete set null) —
  -- الإشارة تفضل موجودة تاريخيًا حتى لو مصدر الـ Standard اختفى.
  standard_project_id  uuid references public.projects(id) on delete set null,
  client_project_id    uuid not null references public.projects(id) on delete cascade,
  change_request_id    uuid not null references public.client_change_requests(id) on delete cascade,

  change_type          text not null,      -- add/modify/remove (من client_change_requests.type)
  artifact_type        text not null,      -- من change_impacts.artifact_type
  impact_type          text not null,      -- add/modify/remove (من change_impacts.impact_type)
  title                text not null default '',  -- عنوان طلب التغيير، لتجميع بشري مقروء لاحقًا

  recorded_at          timestamptz not null default now()
);

create index if not exists idx_standard_learning_signals_standard on public.standard_learning_signals(standard_project_id, artifact_type);

-- ============================================================
-- Row Level Security — نفس نمط 0001/0113/0120/0122/0123/0124.
-- ============================================================
alter table public.prototype_change_prompts enable row level security;
alter table public.standard_learning_signals enable row level security;

drop policy if exists internal_read_prototype_change_prompts on public.prototype_change_prompts;
create policy internal_read_prototype_change_prompts on public.prototype_change_prompts
  for select using (auth.uid() is not null);

drop policy if exists internal_write_prototype_change_prompts on public.prototype_change_prompts;
create policy internal_write_prototype_change_prompts on public.prototype_change_prompts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists internal_read_standard_learning_signals on public.standard_learning_signals;
create policy internal_read_standard_learning_signals on public.standard_learning_signals
  for select using (auth.uid() is not null);

drop policy if exists internal_write_standard_learning_signals on public.standard_learning_signals;
create policy internal_write_standard_learning_signals on public.standard_learning_signals
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 3) علم "يحتاج إعادة تجميع" على حزمة الـ Handoff الموجودة فعليًا
-- (public.handoff_packages، من 0105) — عمدًا امتداد إضافي على الجدول
-- الحقيقي الموجود، مش جدول جديد موازٍ. اتفحص أولًا: handoff_packages
-- مالوش أي عمود مكافئ حاليًا (status الموجود بيعكس دورة حياة التسليم
-- نفسها draft/ready/finalized/superseded، مش "هل المحتوى اتغيّر بعد آخر
-- تجميع؟") — فالعمودين الجداد إضافة حقيقية، مش تكرار.
--
-- بيتظبّط تلقائيًا من applyApprovedImpacts (lib/sector-standards/
-- apply-changes-service.ts) بعد أي تطبيق ناجح — عبر
-- lib/sector-standards/handoff-regeneration.ts::flagHandoffNeedsRegeneration.
-- بيتصفّر تلقائيًا من applyAssembly (lib/handoff/assembler.ts) في كل مرة
-- بيتجمّع فيها Package طازج.
-- ============================================================
alter table public.handoff_packages
  add column if not exists needs_regeneration boolean not null default false;
alter table public.handoff_packages
  add column if not exists regeneration_reason text not null default '';

-- ============================================================
-- 4) إعداد النموذج لمهمة توليد Prompt تغيير الـ Prototype
-- (prototype_change_prompt_generation) — نفس نمط 0119/0124: أي نوع مهمة
-- جديد بيتضاف في الكود محتاج صف هنا وإلا AIService بيرجع لإعداد افتراضي
-- غير متحكَّم فيه من الإعدادات لحد ما الهجرة دي تتطبّق. gemini-3.5-flash
-- نفس الموديل المستخدم في project_assistant_qa (0119) — مهمة توليد نصي
-- خفيف (Prompt واحد عملي)، مش JSON ضخم متعدد الأقسام زي
-- standard_change_impact_analysis (0124).
-- ============================================================
insert into public.ai_task_model_config (task_type, provider, model)
values
  ('prototype_change_prompt_generation', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;

-- ============================================================================
-- انتهت 0125
-- ============================================================================
