-- ============================================================
-- تراجع 0078 — الذاكرة الدلالية ورسم الأثر
--
-- **اقرأ قبل التشغيل:** ده بيحذف الفهرس الدلالي وحواف الأثر. البيانات
-- **مشتقّة** (متجهات وحواف مُستنتَجة)، فيمكن إعادة بنائها — لكن إعادة
-- توليد المتجهات بتكلّف نداءات embedding من جديد.
--
-- pgvector نفسها **مش بتتشال**: ترحيل ٠٠٥١ لسه بيعتمد عليها.
-- ============================================================

drop function if exists public.match_knowledge_memory(uuid, vector, float, int, text);

drop table if exists public.knowledge_impact_edges;
drop table if exists public.knowledge_memory;
