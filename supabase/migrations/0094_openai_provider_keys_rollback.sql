-- ============================================================
-- تراجع 0094 — يرجّع قيد provider لـ 'gemini' فقط.
-- تحذير: لو فيه صفوف بمزوّد غير gemini، احذفها أولًا وإلا القيد هيفشل.
-- ============================================================

delete from public.ai_provider_keys where provider <> 'gemini';

alter table public.ai_provider_keys
  drop constraint if exists ai_provider_keys_provider_check;

alter table public.ai_provider_keys
  add constraint ai_provider_keys_provider_check
  check (provider in ('gemini'));
