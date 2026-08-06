-- ============================================================
-- تراجع الترحيل 0074 — منصة الذكاء الاصطناعي
--
-- **لا يُنفَّذ إلا عند الحاجة الصريحة للتراجع.**
--
-- ملاحظة مهمة: حذف أعمدة `ai_requests_log` **يفقد بيانات التكلفة
-- المسجَّلة**. لو كان القياس شغّال فترة، صدّرها قبل التراجع:
--
--   select * from ai_requests_log where cost_usd is not null;
--
-- الجداول الجديدة حذفها آمن — كلها بيانات مشتقّة أو ذاكرة.
-- ============================================================

drop function if exists public.ai_cost_summary(timestamptz);

drop table if exists public.ai_cache             cascade;
drop table if exists public.ai_results           cascade;
drop table if exists public.ai_prompt_versions   cascade;
drop table if exists public.ai_prompt_templates  cascade;
drop table if exists public.ai_provider_health   cascade;
drop table if exists public.ai_pricing           cascade;

-- الأعمدة المضافة على الجدول القائم — الحذف هنا يفقد بيانات.
alter table public.ai_requests_log
  drop column if exists input_tokens,
  drop column if exists output_tokens,
  drop column if exists total_tokens,
  drop column if exists cost_usd,
  drop column if exists cached,
  drop column if exists job_id,
  drop column if exists trace_id,
  drop column if exists prompt_version,
  drop column if exists worker_version,
  drop column if exists sanitized_fields;
