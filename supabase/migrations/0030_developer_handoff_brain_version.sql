-- Developer Handoff كان بيقرأ Project Brain فعليًا كمدخل توليد لكن من
-- غير أي تتبّع لنسخته — فمفيش طريقة تعرف إن الحزمة بقت "قديمة" لو
-- الـ Brain اتغيّر بعد التوليد. نضيف نفس عمود التتبّع الموجود أصلًا في
-- prd/prototype_prompt/client_presentations.

alter table public.developer_handoff
  add column if not exists generated_from_brain_version integer;

alter table public.developer_handoff_versions
  add column if not exists generated_from_brain_version integer;
