-- ============================================================
-- توسيع audit_log.action ليشمل أحداث تسجيل الدخول/الخروج
-- تعديل غير مدمّر: يوسّع قائمة القيم المسموحة فقط، لا يحذف بيانات.
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

alter table public.audit_log
  drop constraint if exists audit_log_action_check;

alter table public.audit_log
  add constraint audit_log_action_check
  check (action in ('create','update','delete','stage_change','login','logout','failed_login'));
