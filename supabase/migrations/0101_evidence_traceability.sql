-- ============================================================================
-- 0101 — Evidence Traceability
-- ============================================================================
-- الغرض: ربط أي Requirement / Story / AC بأدلة من P5 (Market Research +
-- Problem Validation). يوفّر أساس جودة الـ PRD (زر "Show Evidence" على
-- كل عنصر).
--
-- نمط Polymorphic خفيف: (source_type, source_id) + (evidence_type, evidence_id)
-- بدل جداول ربط منفصلة لكل زوج — يقلّل عدد الجداول ويسمح بتوسّع مصادر لاحقًا.
--
-- كل الجدول جديد. Backwards-compat.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.evidence_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- الطرف المستهدف: الشيء اللي بيستند لدليل
  source_type       text        NOT NULL,   -- 'requirement' | 'user_story' | 'acceptance_criterion'
  source_id         uuid        NOT NULL,
  -- الطرف الدليلي: مصدر الاستناد
  evidence_type     text        NOT NULL,   -- 'market_research' | 'problem_validation'
  evidence_id       uuid        NOT NULL,
  -- تعليق يشرح كيف الدليل يخدم الطرف (اختياري لكن مُنصَح به)
  note              text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT ev_source_type_valid CHECK (source_type IN (
    'requirement','user_story','acceptance_criterion'
  )),
  CONSTRAINT ev_evidence_type_valid CHECK (evidence_type IN (
    'market_research','problem_validation'
  )),
  -- نفس الربط ما يتكررش
  CONSTRAINT ev_uniq UNIQUE (project_id, source_type, source_id, evidence_type, evidence_id)
);

COMMENT ON TABLE public.evidence_links IS
  'روابط Polymorphic بين عناصر تعريف المنتج والقصص/AC وبين أدلة البحث والتحقق.';

CREATE INDEX IF NOT EXISTS idx_ev_project      ON public.evidence_links (project_id);
CREATE INDEX IF NOT EXISTS idx_ev_source       ON public.evidence_links (project_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ev_evidence     ON public.evidence_links (project_id, evidence_type, evidence_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.evidence_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidence_links_select ON public.evidence_links;
CREATE POLICY evidence_links_select ON public.evidence_links
  FOR SELECT USING (auth.uid() IS NOT NULL);
