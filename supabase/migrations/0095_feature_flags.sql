-- ============================================================================
-- 0095 — Feature Flags (NEXVORA Transformation P1)
-- ============================================================================
-- الأساس المركزي لكل تحويلات NEXVORA. أي ميزة جديدة أو مخفية تُوجَّه من هنا.
-- خصائص التصميم:
--   • Global toggle (enabled_globally) — يفعّل/يعطّل لكل المستخدمين.
--   • Per-user override (enabled_per_user) — قائمة user_ids تحصل على السلوك
--     المعكوس عن الافتراضي (للـ Beta test أو rollout تدريجي).
--   • updated_by/updated_at — سجل تدقيق أساسي.
--   • عدم كسر أي شيء موجود — الجدول جديد وحده، بدون FK ملزمة.
--
-- Seed أولي: flagين للـ Transformation Phase 1.
--   • product_mode = enabled → المنصّة في وضع NEXVORA (يستخدم لاحقًا في P3+
--     لتغيير Navigation وغيرها).
--   • extended_technical_delivery = disabled → إخفاء وحدات Claude Exec,
--     Engineering QA, Production Monitoring, Migration, Hypercare من Core
--     (التطبيق الفعلي يحصل في P3).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  name              text        PRIMARY KEY,
  description       text        NOT NULL DEFAULT '',
  enabled_globally  boolean     NOT NULL DEFAULT false,
  enabled_per_user  uuid[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.feature_flags IS
  'مصدر مركزي لكل تحويلات NEXVORA — كل ميزة جديدة أو مخفية تُقرأ من هنا.';
COMMENT ON COLUMN public.feature_flags.enabled_per_user IS
  'قائمة user IDs تحصل على السلوك المعكوس عن enabled_globally (rollout تدريجي).';

-- ---------------------------------------------------------------------------
-- Seed — flags الأساسية لـ Phase 1
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (name, description, enabled_globally)
VALUES
  ('product_mode',
   'وضع NEXVORA للـ Product Discovery & Handoff. مفعّل افتراضيًا للنسخة الجديدة.',
   true),
  ('extended_technical_delivery',
   'إظهار وحدات التسليم التقني الموسّع (Claude Execution، Engineering QA، Production Monitoring، Migration، Hypercare). معطّل افتراضيًا في NEXVORA Core.',
   false)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trigger لتحديث updated_at تلقائيًا عند أي تعديل.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feature_flags_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.feature_flags_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — قراءة للجميع (Client-safe للـ isEnabled)، كتابة للمالك/المسؤول فقط.
-- ---------------------------------------------------------------------------
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_select ON public.feature_flags;
CREATE POLICY feature_flags_select
  ON public.feature_flags
  FOR SELECT
  USING (true);

-- الكتابة تمر عبر service client من الخادم فقط (لا حاجة لسياسة RLS لها،
-- سياسة insert/update/delete افتراضية = deny لغير service role).
