-- ============================================================================
-- 0096 — Workflow v2: 7 Product-Focused Stages (NEXVORA Transformation P2)
-- ============================================================================
-- الغرض: توفير Workflow جديد بـ 7 مراحل جوهرية لمشاريع NEXVORA الجديدة،
-- **جنب** الـ 24 stage القديم اللي بيفضل يشتغل بدون تغيير على المشاريع الموجودة.
--
-- قواعد أمان صارمة:
--   • لا يتم لمس lib/workflow القديم أو workflow_stages_v1 (إن وجدت).
--   • عمود project_workflow_version يحدّد أي واجهة تُعرض:
--       v1 = الافتراضي لكل المشاريع الموجودة (بيبقى كما هو).
--       v2 = المشاريع الجديدة اللي تُنشأ بعد تفعيل product_mode.
--   • Adapter (في lib/workflow-v2/adapter.ts) بيترجم مراحل v1 لـ v2 للعرض
--     فقط، بدون كتابة أي شيء في الجداول القديمة.
--
-- المراحل السبع (بالترتيب):
--   1. client_and_project      — Client & Project (Lead → Project + basics)
--   2. discovery_and_research   — Discovery & Research (Forms + Meetings + Market Research + Interviews)
--   3. analysis_and_validation  — Analysis & Validation (Analysis + Brain + Problem Validation)
--   4. product_definition       — Product Definition (Scope & MVP + Personas + Flows + Requirements)
--   5. prototype_and_review     — Prototype & Review (Prompt V2 + Product Review + Iterations)
--   6. client_approval          — Client Approval (Portal + Version-Pinned Approval)
--   7. handoff_and_closure      — Handoff & Closure (Package + External Partner + Sign-off)
--
-- كل مرحلة داخليًا فيها Checklist بعناصرها الفرعية — المستخدم يشوف مرحلة
-- واحدة، النظام يتتبّع تقدّم كل عنصر داخليًا.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) جدول تعريف المراحل السبع
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_stages_v2 (
  key           text        PRIMARY KEY,
  slug          text        NOT NULL UNIQUE,
  display_name  text        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  icon          text        NOT NULL DEFAULT 'Circle',
  stage_order   int         NOT NULL,
  dependencies  text[]      NOT NULL DEFAULT '{}',
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_stages_v2_order_positive CHECK (stage_order > 0)
);

COMMENT ON TABLE public.workflow_stages_v2 IS
  'المراحل السبع الجوهرية لمشاريع NEXVORA v2. المشاريع القديمة على v1 بتفضل بدون لمس.';

-- ---------------------------------------------------------------------------
-- 2) جدول العناصر الداخلية لكل مرحلة (Checklist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_stage_checklists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key     text        NOT NULL REFERENCES public.workflow_stages_v2(key) ON DELETE CASCADE,
  item_key      text        NOT NULL,
  display_name  text        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  item_order    int         NOT NULL,
  is_mandatory  boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_stage_checklists_uk UNIQUE (stage_key, item_key)
);

COMMENT ON TABLE public.workflow_stage_checklists IS
  'العناصر الفرعية داخل كل مرحلة (Personas داخل Product Definition مثلًا). المستخدم يشوف المرحلة، النظام يتتبّع العناصر داخليًا.';

CREATE INDEX IF NOT EXISTS idx_workflow_stage_checklists_stage
  ON public.workflow_stage_checklists (stage_key, item_order);

-- ---------------------------------------------------------------------------
-- 3) تحديد إصدار Workflow للمشروع
-- ---------------------------------------------------------------------------
-- ملاحظة: بنعامل الوجود بمرونة عشان لو الجدول جدول اسمه projects غير موجود
-- في نسخة معيّنة، الـ migration ما يفشلش. بس عمليًا الجدول موجود دائمًا.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='projects' AND column_name='workflow_version'
    ) THEN
      ALTER TABLE public.projects
        ADD COLUMN workflow_version text NOT NULL DEFAULT 'v1'
        CHECK (workflow_version IN ('v1','v2'));
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.projects.workflow_version IS
  'أي Workflow يستخدم هذا المشروع: v1 = الـ 24 stage القديم (المشاريع الموجودة). v2 = المراحل السبع الجديدة (المشاريع الجديدة).';

-- ---------------------------------------------------------------------------
-- 4) Seed — المراحل السبع
-- ---------------------------------------------------------------------------
INSERT INTO public.workflow_stages_v2 (key, slug, display_name, description, icon, stage_order, dependencies)
VALUES
  ('client_and_project',
   'client-and-project',
   'العميل والمشروع',
   'تأهيل العميل، تحويل Lead لمشروع، تعيين مسؤول، تحديد الميزانية والمدة.',
   'Users',
   1,
   '{}'),
  ('discovery_and_research',
   'discovery-and-research',
   'الاكتشاف والبحث',
   'نماذج الاكتشاف، جلسات العميل، أبحاث السوق والمنافسين، مقابلات المستخدمين.',
   'Search',
   2,
   '{"client_and_project"}'),
  ('analysis_and_validation',
   'analysis-and-validation',
   'التحليل والتحقق',
   'تحليل الاكتشاف، بناء عقل المشروع، توصيات، تحقق من المشاكل والافتراضات.',
   'Brain',
   3,
   '{"discovery_and_research"}'),
  ('product_definition',
   'product-definition',
   'تعريف المنتج',
   'Scope & MVP، Personas، User Flows، Requirements، User Stories، Acceptance Criteria.',
   'Layers',
   4,
   '{"analysis_and_validation"}'),
  ('prototype_and_review',
   'prototype-and-review',
   'Prototype والمراجعة',
   'توليد Prototype Prompt V2، مراجعة المنتج، تعليقات، إصلاحات، اعتماد.',
   'Wand2',
   5,
   '{"product_definition"}'),
  ('client_approval',
   'client-approval',
   'موافقة العميل',
   'عرض Prototype + Scope للعميل عبر Portal آمن، موافقة مثبّتة على نسخة.',
   'BadgeCheck',
   6,
   '{"prototype_and_review"}'),
  ('handoff_and_closure',
   'handoff-and-closure',
   'التسليم والإغلاق',
   'حزمة التسليم النهائية (Product Handoff Package) + استلام من الشريك التقني.',
   'PackageCheck',
   7,
   '{"client_approval"}')
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  icon         = EXCLUDED.icon,
  stage_order  = EXCLUDED.stage_order,
  dependencies = EXCLUDED.dependencies,
  updated_at   = now();

-- ---------------------------------------------------------------------------
-- 5) Seed — عناصر Checklist لكل مرحلة
-- ---------------------------------------------------------------------------
-- المرحلة 1: العميل والمشروع
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('client_and_project','lead_qualification','تأهيل العميل المحتمل',1,true),
  ('client_and_project','project_created','إنشاء المشروع من Lead',2,true),
  ('client_and_project','industry_and_service','تحديد القطاع ونوع الخدمة',3,true),
  ('client_and_project','budget_and_duration','الميزانية والمدة المتوقعة',4,true),
  ('client_and_project','owner_assigned','تعيين مسؤول المشروع',5,true),
  ('client_and_project','initial_contract','عقد ودفعة أولى (اختياري في الإعداد الأولي)',6,false)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- المرحلة 2: الاكتشاف والبحث
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('discovery_and_research','discovery_form_created','إنشاء نموذج اكتشاف',1,true),
  ('discovery_and_research','discovery_link_sent','إرسال رابط الاكتشاف للعميل',2,true),
  ('discovery_and_research','discovery_submitted','استلام إجابات العميل',3,true),
  ('discovery_and_research','meeting_prep_generated','تجهيز أول اجتماع اكتشاف',4,false),
  ('discovery_and_research','discovery_meeting_held','عقد الاجتماع وتوثيق نتائجه',5,false),
  ('discovery_and_research','market_research','بحث السوق (اختياري)',6,false),
  ('discovery_and_research','competitor_research','بحث المنافسين (اختياري)',7,false),
  ('discovery_and_research','customer_interviews','مقابلات المستخدمين (اختياري)',8,false)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- المرحلة 3: التحليل والتحقق
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('analysis_and_validation','discovery_analysis','تحليل الاكتشاف (17 قسم)',1,true),
  ('analysis_and_validation','project_brain_built','بناء عقل المشروع (Brain v2)',2,true),
  ('analysis_and_validation','smart_recommendations','مراجعة التوصيات الذكية',3,false),
  ('analysis_and_validation','problem_validation','تحقق المشاكل والافتراضات',4,true),
  ('analysis_and_validation','brain_review_approved','اعتماد Brain Review (7 blockers)',5,true)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- المرحلة 4: تعريف المنتج
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('product_definition','problem_brief','Problem Brief',1,true),
  ('product_definition','target_users_and_personas','المستخدمون المستهدفون + Personas',2,true),
  ('product_definition','scope_and_mvp','Scope & MVP (Must/Should/Could/Won''t)',3,true),
  ('product_definition','user_flows','User Flows',4,true),
  ('product_definition','features_and_requirements','الميزات والمتطلبات',5,true),
  ('product_definition','business_rules','قواعد العمل',6,false),
  ('product_definition','risks_assumptions_dependencies','المخاطر والافتراضات والاعتمادات',7,false),
  ('product_definition','success_metrics','مؤشرات النجاح',8,false),
  ('product_definition','open_questions','أسئلة مفتوحة (اختياري — للاجتماع القادم)',9,false)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- المرحلة 5: Prototype والمراجعة
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('prototype_and_review','prototype_plan','خطة توليد الـ Prototype',1,true),
  ('prototype_and_review','prototype_prompts_generated','توليد Prompts للـ Prototype (V2 Pipeline)',2,true),
  ('prototype_and_review','prototype_link_available','رابط Prototype جاهز للمراجعة',3,true),
  ('prototype_and_review','product_review_completed','إنجاز Product Review (تغطية Stories/Flows/Errors/Empty States)',4,true),
  ('prototype_and_review','iterations_resolved','معالجة تعليقات المراجعة',5,false)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- المرحلة 6: موافقة العميل
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('client_approval','client_presentation_ready','عرض العميل جاهز (PPTX + Portal)',1,true),
  ('client_approval','client_portal_link_shared','مشاركة رابط Portal الآمن مع العميل',2,true),
  ('client_approval','scope_approved','اعتماد Scope',3,true),
  ('client_approval','prototype_approved','اعتماد Prototype',4,true),
  ('client_approval','package_pre_approved','موافقة مبدئية على حزمة التسليم',5,false),
  ('client_approval','commercial_agreement','اعتماد Pricing/Proposals (اختياري لو تم قبلًا)',6,false)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- المرحلة 7: التسليم والإغلاق
INSERT INTO public.workflow_stage_checklists (stage_key, item_key, display_name, item_order, is_mandatory) VALUES
  ('handoff_and_closure','package_assembled','تجميع Handoff Package (7 إلزامية + الاختياريات)',1,true),
  ('handoff_and_closure','evaluation_guide_ready','Product Evaluation Guide مكتمل',2,true),
  ('handoff_and_closure','external_partner_invited','دعوة الشريك التقني الخارجي',3,false),
  ('handoff_and_closure','partner_questions_resolved','معالجة أسئلة الشريك التقني',4,false),
  ('handoff_and_closure','package_delivered','تسليم الحزمة',5,true),
  ('handoff_and_closure','handoff_accepted','قبول رسمي من الشريك التقني',6,true)
ON CONFLICT (stage_key, item_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) Trigger لتحديث updated_at على workflow_stages_v2
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workflow_stages_v2_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_stages_v2_updated_at ON public.workflow_stages_v2;
CREATE TRIGGER trg_workflow_stages_v2_updated_at
BEFORE UPDATE ON public.workflow_stages_v2
FOR EACH ROW
EXECUTE FUNCTION public.workflow_stages_v2_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7) RLS — قراءة للجميع (تعريف المراحل مش سرّي)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workflow_stages_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_stage_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_stages_v2_select ON public.workflow_stages_v2;
CREATE POLICY workflow_stages_v2_select ON public.workflow_stages_v2 FOR SELECT USING (true);

DROP POLICY IF EXISTS workflow_stage_checklists_select ON public.workflow_stage_checklists;
CREATE POLICY workflow_stage_checklists_select ON public.workflow_stage_checklists FOR SELECT USING (true);

-- الكتابة تمر عبر service client فقط.
