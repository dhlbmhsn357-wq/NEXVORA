-- ============================================================================
-- 0112 — Definition ← Brain import linkage (idempotency column)
-- Additive only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- الغرض: ربط صفوف product_personas / product_requirements بعنصر Brain
-- المصدر (brain_review_objects) اللي اتولّدت منه، عشان زر "استورد من الـ
-- Brain المعتمد" (تعريف المنتج) يقدر يتفادى استيراد نفس العنصر مرتين.
-- القيمة المخزّنة: "<section_key>::<item_key>" — نفس صيغة الربط المستخدَمة
-- داخليًا في lib/brain-v2/review-objects-service.ts.
-- ============================================================================

ALTER TABLE public.product_personas
  ADD COLUMN IF NOT EXISTS source_brain_item_key text NULL;

ALTER TABLE public.product_requirements
  ADD COLUMN IF NOT EXISTS source_brain_item_key text NULL;

COMMENT ON COLUMN public.product_personas.source_brain_item_key IS
  'مفتاح عنصر Brain المصدر ("section_key::item_key") لو الـ persona دي مستوردة من Project Brain المعتمد — NULL لو أُنشئت يدويًا.';
COMMENT ON COLUMN public.product_requirements.source_brain_item_key IS
  'مفتاح عنصر Brain المصدر ("section_key::item_key") لو المتطلب ده مستورد من Project Brain المعتمد — NULL لو أُنشئ يدويًا.';

-- فهارس جزئية (بس للصفوف المستوردة) — تسريع فحص "هل العنصر ده مستورد
-- بالفعل؟" وقت بناء خطة الاستيراد، من غير ما تؤثر على الصفوف اليدوية.
CREATE INDEX IF NOT EXISTS idx_personas_brain_source
  ON public.product_personas (project_id, source_brain_item_key)
  WHERE source_brain_item_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reqs_brain_source
  ON public.product_requirements (project_id, source_brain_item_key)
  WHERE source_brain_item_key IS NOT NULL;
