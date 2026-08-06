-- ============================================================
-- Project Brain Synchronization Engine (Phase 3 Enhancement)
-- — طبقة "معرفة معلّقة" (Pending Knowledge) بين أي مصدر جديد (اجتماع/
-- ملاحظة يدوية/Prototype Review/دعم فني) وProject Brain نفسه. القرار
-- المعماري المؤكّد مع المستخدم: الثقة (Confidence) تعيش هنا فقط، مش
-- تعديل بنية BrainContent الحالية (تجنّب إعادة كتابة كل ملف بيستخدمها).
--
-- القاعدة الجديدة المؤكّدة: ممنوع أي تحديث صامت لـ Brain من أي مصدر —
-- حتى المصادر الحالية (الاجتماعات، كانت بتُدمج بصمت قبل كده). كل تغيير
-- لازم يعدّي من هنا وينتظر قرار PM (Accept/Reject/Merge).
-- ============================================================

create table if not exists public.brain_change_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type text not null
    check (source_type in ('meeting_transcript','meeting_ai_analysis','manual_note','prototype_review','support_feedback')),
  source_reference text not null default '',
  summary text not null default '',
  status text not null default 'pending' check (status in ('pending','reviewed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_brain_change_batches_project on public.brain_change_batches(project_id, created_at desc);

create table if not exists public.brain_pending_changes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.brain_change_batches(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  section_key text not null,
  change_type text not null check (change_type in ('add','modify','remove')),
  source_type text not null
    check (source_type in ('meeting_transcript','meeting_ai_analysis','manual_note','prototype_review','support_feedback')),
  source_reference text not null default '',
  confidence_score integer not null check (confidence_score >= 0 and confidence_score <= 100),
  old_value jsonb,
  new_value jsonb not null,
  item_label text not null default '',
  conflict boolean not null default false,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','merged')),
  rationale text not null default '',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_brain_pending_changes_project on public.brain_pending_changes(project_id, status);
create index if not exists idx_brain_pending_changes_batch on public.brain_pending_changes(batch_id);

-- Knowledge Graph خفيف — روابط بين كيانات حقيقية عندها صفوف فعلية
-- (Pending Changes المعتمدة، اجتماعات، طلبات دعم، Prototype Review) —
-- مش قاعدة بيانات Graph منفصلة، مجرد جدول علاقات فوق الـ IDs الموجودة.
create table if not exists public.brain_knowledge_graph_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_type text not null,
  from_id text not null,
  to_type text not null,
  to_id text not null,
  relation_type text not null default 'related_to',
  created_at timestamptz not null default now()
);

create index if not exists idx_brain_graph_edges_project on public.brain_knowledge_graph_edges(project_id);
create index if not exists idx_brain_graph_edges_from on public.brain_knowledge_graph_edges(from_type, from_id);

-- ============================================================
-- Row Level Security — نفس نمط كل الجداول السابقة
-- ============================================================
alter table public.brain_change_batches enable row level security;
alter table public.brain_pending_changes enable row level security;
alter table public.brain_knowledge_graph_edges enable row level security;

create policy "internal_read_brain_change_batches" on public.brain_change_batches for select using (auth.uid() is not null);
create policy "internal_write_brain_change_batches" on public.brain_change_batches for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_brain_pending_changes" on public.brain_pending_changes for select using (auth.uid() is not null);
create policy "internal_write_brain_pending_changes" on public.brain_pending_changes for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "internal_read_brain_knowledge_graph_edges" on public.brain_knowledge_graph_edges for select using (auth.uid() is not null);
create policy "internal_write_brain_knowledge_graph_edges" on public.brain_knowledge_graph_edges for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter publication supabase_realtime add table public.brain_pending_changes;
