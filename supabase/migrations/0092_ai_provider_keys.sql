-- ============================================================
-- 0092 — مفاتيح مزوّدي الذكاء الاصطناعي في قاعدة البيانات (مصدر مشترك)
--
-- المشكلة الجذرية: المفاتيح كانت في متغيّرات البيئة، فلازم تُضبط في كل
-- بيئة تشغيل (Vercel + Railway) بشكل منفصل — وأي عدم تطابق = فشل صامت
-- ووقوع على المفاتيح المجانية.
--
-- الحل: تخزين المفاتيح **مشفَّرة** هنا. البيئتان متصلتان بـ Supabase أصلًا،
-- فأي بيئة تقرأ نفس المفاتيح تلقائيًّا. تُدمَج مع متغيّرات البيئة (لا تُلغيها)
-- فالإعداد القديم يظل يعمل.
--
-- أمان: القيمة مشفَّرة AES-256-GCM (MIGRATION_SECRET_KEY) — لا مفتاح نصّي.
-- لا قراءة لغير service_role (حتى المستخدم المصادَق لا يرى الـblob المشفَّر).
-- التراجع في 0092_ai_provider_keys_rollback.sql.
-- ============================================================

create table if not exists public.ai_provider_keys (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'gemini' check (provider in ('gemini')),
  tier          text not null default 'free' check (tier in ('free','paid')),
  label         text not null default '',
  -- المفتاح مشفَّر (v1:iv:tag:cipher) — لا يُخزَّن نصًّا أبدًا.
  key_encrypted text not null,
  -- آخر 4 محارف للعرض الآمن في الواجهة (تمييز المفاتيح بلا كشفها).
  key_hint      text not null default '',
  active        boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_ai_keys_lookup on public.ai_provider_keys (provider, tier, active);


-- ============================================================
-- أمان مستوى الصف — service_role فقط (المفاتيح سرّية)
-- ============================================================

do $ak_rls$
begin
  execute 'alter table public.ai_provider_keys enable row level security';
  execute 'drop policy if exists ai_provider_keys_service_all on public.ai_provider_keys';
  execute 'create policy ai_provider_keys_service_all on public.ai_provider_keys for all to service_role using (true) with check (true)';
end $ak_rls$;


-- ============================================================
-- touch updated_at
-- ============================================================

drop trigger if exists on_ai_provider_keys_touch on public.ai_provider_keys;
create trigger on_ai_provider_keys_touch before update on public.ai_provider_keys
  for each row execute procedure public.touch_updated_at();
