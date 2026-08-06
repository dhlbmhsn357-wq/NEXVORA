-- ============================================================
-- 0094 — توسيع مخزن مفاتيح مزوّدي الذكاء الاصطناعي ليشمل OpenAI
--
-- 0092 قصر العمود provider على 'gemini' فقط بقيد CHECK. علشان نخزّن
-- مفتاح OpenAI (ChatGPT) مشفَّرًا في نفس المخزن المشترك — فيُقرأ تلقائيًّا
-- من Vercel + Railway بلا ضبط منفصل — نوسّع القيد ليشمل بقية المزوّدين.
-- Additive بالكامل: مفاتيح Gemini الحالية ما تتأثرش.
-- ============================================================

alter table public.ai_provider_keys
  drop constraint if exists ai_provider_keys_provider_check;

alter table public.ai_provider_keys
  add constraint ai_provider_keys_provider_check
  check (provider in ('gemini', 'openai', 'claude', 'deepseek'));
