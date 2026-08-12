-- ============================================================================
-- 0113 — project_recommendations source_ref (idempotency column)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- الغرض: ربط صفوف project_recommendations اللي بتتولّد تلقائيًا (مثلًا من
-- محرّك التحقّق المعماري) بمصدرها الأصلي، عشان إعادة تشغيل نفس العملية
-- (زر "إعادة التحقّق") ما تكررش نفس التوصية. لو الصف اتضاف يدويًا أو من
-- مسار تاني، القيمة NULL.
--
-- صيغة القيمة لتوصيات التحقّق المعماري (lib/architecture-validation/service.ts):
--   "architecture_gap:<module_key|feature_key|gap_category>:<normalized_key>"
-- ============================================================================

ALTER TABLE public.project_recommendations
  ADD COLUMN IF NOT EXISTS source_ref text NULL;

COMMENT ON COLUMN public.project_recommendations.source_ref IS
  'مفتاح تتبّع ثابت لمصدر التوصية لو اتولّدت تلقائيًا (مثلًا "architecture_gap:module:crm") — يمنع تكرار نفس التوصية عند إعادة تشغيل المصدر. NULL للتوصيات اليدوية/غير المتتبَّعة.';

-- فهرس جزئي (بس للصفوف المتتبَّعة) — تسريع فحص "هل التوصية دي موجودة
-- بالفعل لنفس المشروع؟" وقت المزامنة، من غير ما يؤثر على الصفوف اليدوية.
CREATE INDEX IF NOT EXISTS idx_project_recommendations_source_ref
  ON public.project_recommendations (project_id, source_ref)
  WHERE source_ref IS NOT NULL;
