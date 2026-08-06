-- ============================================================
-- Phase 4 — توسيع project_brain_entries.entry_type ليشمل تصنيفات
-- الاستخراج من الاجتماعات (request, deadline) بدون فقدان دقة المعنى
-- بدل إجبارها على تصنيف "note" الحالي. تعديل غير مدمّر (توسيع فقط).
-- شغّل هذا الملف كامل في Supabase SQL Editor مرة واحدة.
-- ============================================================

alter table public.project_brain_entries
  drop constraint if exists project_brain_entries_entry_type_check;

alter table public.project_brain_entries
  add constraint project_brain_entries_entry_type_check
  check (entry_type in ('note','decision','link','risk','question','request','deadline'));
