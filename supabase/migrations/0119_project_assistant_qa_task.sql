-- 0119 — إعداد النموذج لمهمة مساعد المشروع (Phase C)
--
-- نفس المشكلة الموصوفة في 0072: `ai_task_model_config` بيتقرأ منه إعداد
-- النموذج لكل نوع مهمة، وأي نوع جديد بيتضاف في الكود من غير صف هنا كان
-- بيرجع لإعداد افتراضي (أشيع إعداد مستخدم في الجدول) — شغّال لكن غير
-- متحكَّم فيه من الإعدادات لحد ما الهجرة دي تتطبّق.
--
-- إضافية بالكامل، و`on conflict do nothing` بتخلّيها آمنة لو اتشغّلت
-- أكتر من مرة أو لو الموديل اتظبط يدويًا قبل كده.

insert into public.ai_task_model_config (task_type, provider, model)
values
  ('project_assistant_qa', 'gemini', 'gemini-3.5-flash')
on conflict (task_type) do nothing;
