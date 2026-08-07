-- ============================================================================
-- 0104 — Client Approval Portal (P11)
-- ============================================================================
-- بوابة عامة (بدون تسجيل دخول) للعميل ليعتمد/يرفض المخرجات (PRD/Presentation).
-- Token آمن (32 بايت hex)، انتهاء صلاحية، إمكانية revoke، سجل audit كامل.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_approvals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Token عام غير قابل للتخمين (نولّده client-side بـ crypto.randomBytes)
  public_token      text        NOT NULL UNIQUE,
  -- الشيء اللي بيوافق عليه العميل: PRD نسخة X أو Presentation نسخة Y
  target_type       text        NOT NULL,     -- 'prd' | 'presentation' | 'proposal' | 'brain'
  target_id         uuid        NULL,          -- FK اختياري (لأن الأنواع مختلفة)
  target_version    int         NULL,          -- نسخة الـ target وقت الإرسال (للـ version pinning)
  title             text        NOT NULL,
  summary           text        NOT NULL DEFAULT '',
  client_name       text        NOT NULL DEFAULT '',
  client_email      text        NOT NULL DEFAULT '',
  status            text        NOT NULL DEFAULT 'pending',
  decision          text        NULL,          -- 'approved' | 'rejected' | 'changes_requested'
  decision_note     text        NOT NULL DEFAULT '',
  decided_at        timestamptz NULL,
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz NULL,
  revoked_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason     text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT ca_target_type_valid CHECK (target_type IN ('prd','presentation','proposal','brain')),
  CONSTRAINT ca_status_valid CHECK (status IN ('pending','decided','expired','revoked')),
  CONSTRAINT ca_decision_valid CHECK (decision IS NULL OR decision IN ('approved','rejected','changes_requested'))
);
CREATE INDEX IF NOT EXISTS idx_ca_project ON public.client_approvals (project_id);
CREATE INDEX IF NOT EXISTS idx_ca_token   ON public.client_approvals (public_token);
CREATE INDEX IF NOT EXISTS idx_ca_status  ON public.client_approvals (project_id, status);

-- Audit log — كل زيارة/قرار
CREATE TABLE IF NOT EXISTS public.client_approval_audit (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id       uuid        NOT NULL REFERENCES public.client_approvals(id) ON DELETE CASCADE,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type        text        NOT NULL,   -- 'viewed' | 'decided' | 'revoked' | 'link_shared'
  event_meta        jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- ip/user_agent/decision/note
  actor             text        NOT NULL DEFAULT '',            -- اسم العميل أو 'system'
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caa_event_valid CHECK (event_type IN ('viewed','decided','revoked','link_shared','expired'))
);
CREATE INDEX IF NOT EXISTS idx_caa_approval ON public.client_approval_audit (approval_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caa_project  ON public.client_approval_audit (project_id, created_at DESC);

ALTER TABLE public.client_approvals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_approval_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ca_select ON public.client_approvals;
CREATE POLICY ca_select ON public.client_approvals
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS caa_select ON public.client_approval_audit;
CREATE POLICY caa_select ON public.client_approval_audit
  FOR SELECT USING (auth.uid() IS NOT NULL);
