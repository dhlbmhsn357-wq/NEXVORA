-- ============================================================================
-- 0121 — إصلاح موديل embedding المسحوب (text-embedding-004 → gemini-embedding-001)
-- Additive/corrective only. NOT auto-applied — run manually in the Supabase SQL editor.
-- ============================================================================
-- السبب: جوجل سحبت text-embedding-004 من v1beta. أي استدعاء AIService.embed()
-- كان بيفشل برسالة:
--   "models/text-embedding-004 is not found for API version v1beta, or is
--    not supported for embedContent."
--
-- ده كان بيأثر على مساعد المشروع (فهرسة + سؤال) وأي ميزة تانية بتستخدم
-- embeddings بصمت من قبل (lib/knowledge-hub/memory-service.ts،
-- lib/organizational-intelligence/project-embedding.ts) — من غير رسالة خطأ
-- واضحة للمستخدم في المسارات القديمة دي (كانت بترجع فشل صامت في الخلفية).
--
-- الموديل الجديد gemini-embedding-001 بيرجّع 3072 بعد افتراضيًا؛ الكود
-- (lib/ai/providers/gemini.ts) بيطلب outputDimensionality=768 صراحة في كل
-- نداء عشان يفضل متوافق مع vector(768) الموجود في knowledge_memory/
-- project_embeddings من غير أي تعديل على العمود نفسه.
--
-- ملاحظة مهمة: أي embeddings قديمة اتخزنت فعلًا بالموديل القديم (لو حصل،
-- غير مرجّح لأن الموديل كان بيفشل من الأساس) هتفضل موجودة زي ما هي —
-- المقارنة الدلالية بين embeddings من موديلين مختلفين مش دقيقة 100%، فلو
-- عندك بيانات مفهرَسة قديمة، شغّل rebuildProjectKnowledge لكل مشروع بعد
-- تطبيق الهجرة دي لإعادة توليدها بالموديل الجديد.
-- ============================================================================

update public.ai_task_model_config
set model = 'gemini-embedding-001'
where task_type = 'embedding'
  and model = 'text-embedding-004';

-- تحديث جدول التسعير التقديري (0074) لنفس السبب — تقدير فقط، مش قيد فعلي.
update public.ai_pricing
set model = 'gemini-embedding-001'
where provider = 'gemini'
  and model = 'text-embedding-004';
