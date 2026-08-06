-- ============================================================
-- PM Operating System — 0027 Fix invalid Gemini model name
--
-- عدة migrations قديمة (0009, 0011-0015) زرعت 'gemini-3.5-flash' كموديل
-- افتراضي لـ 6 مهام — اسم غير مؤكّد الصحة، محتمل يكون سبب أخطاء 404
-- NotFound الظاهرة في Google AI Studio (بعكس 'gemini-2.5-flash' المستخدم
-- في باقي المهام والمؤكّد شغّال). نوحّد الكل على الموديل المؤكّد.
--
-- ملاحظة: ده تحديث بيانات فقط (UPDATE)، مش تغيير Schema. لو أي أدمن
-- كان غيّر الموديل يدويًا من صفحة الإعدادات لقيمة مختلفة عن الافتراضي
-- القديم، الـ WHERE clause بيحافظ عليه (بيصلّح بس الصفوف اللي لسه على
-- القيمة الافتراضية الخاطئة).
-- ============================================================

update public.ai_task_model_config
set model = 'gemini-2.5-flash'
where model = 'gemini-3.5-flash'
  and task_type in (
    'project_brain_sync',
    'prototype_prompt_generation',
    'prototype_review',
    'client_presentation_generation',
    'developer_handoff_generation',
    'support_triage'
  );

-- ============================================================
-- انتهى 0027
-- ============================================================
