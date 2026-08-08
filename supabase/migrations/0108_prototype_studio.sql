-- ============================================================================
-- 0108 — Prototype Studio (replaces Prototype Prompt v2 UI in Product Mode)
-- ============================================================================
-- إضافات بحتة، لا تلمس أي جدول موجود. legacy prototype_prompt_* تفضل شغّالة.
-- Studio بيستخدم Discriminator Pattern (artifact_type) بدل جدول لكل نوع.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) prototype_studio_configs — صف واحد لكل مشروع
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prototype_studio_configs (
  project_id            uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  prototype_type        text NOT NULL DEFAULT 'clickable',
  prototype_goal        text NOT NULL DEFAULT '',
  primary_personas      jsonb NOT NULL DEFAULT '[]'::jsonb,
  core_flows            jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform              text NOT NULL DEFAULT 'web',
  fidelity              text NOT NULL DEFAULT 'mid',
  language              text NOT NULL DEFAULT 'ar',
  is_rtl                boolean NOT NULL DEFAULT true,
  backend_requirement   text NOT NULL DEFAULT 'mocked',
  data_strategy         text NOT NULL DEFAULT 'mock',
  in_scope_items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  out_of_scope_items    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- design_direction jsonb shape:
  -- {
  --   visual_style: string,
  --   brand_colors: [{name, hex}],
  --   typography: {heading, body, sizes},
  --   ui_density: 'comfortable'|'compact'|'spacious',
  --   layout_preference: string,
  --   navigation_preference: string,
  --   accessibility_notes: string
  -- }
  design_direction      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- design_references jsonb shape:
  -- [{ url, screenshot_url, liked, avoid, notes }]
  design_references     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT psc_type_valid CHECK (prototype_type IN ('clickable','functional','poc')),
  CONSTRAINT psc_platform_valid CHECK (platform IN ('web','mobile','both','desktop')),
  CONSTRAINT psc_fidelity_valid CHECK (fidelity IN ('low','mid','high')),
  CONSTRAINT psc_backend_valid CHECK (backend_requirement IN ('none','mocked','minimal_functional')),
  CONSTRAINT psc_data_valid CHECK (data_strategy IN ('mock','real'))
);

-- ---------------------------------------------------------------------------
-- 2) prototype_studio_artifacts — نسخ متعددة، مميّزة بـ artifact_type
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prototype_studio_artifacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type         text NOT NULL,
  version               int  NOT NULL,
  status                text NOT NULL DEFAULT 'draft',
  content_md            text NOT NULL DEFAULT '',
  -- metadata shape:
  -- {
  --   pinned_prd_version: int|null,
  --   pinned_brain_version: int|null,
  --   pinned_config_updated_at: iso|null,
  --   chatgpt_session_ref: string|null,
  --   source_details: string|null
  -- }
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'system',
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at           timestamptz NULL,
  notes                 text NOT NULL DEFAULT '',
  CONSTRAINT psa_type_valid   CHECK (artifact_type IN ('context_pack','build_brief','codex_build_pack')),
  CONSTRAINT psa_status_valid CHECK (status IN ('draft','active','approved','superseded')),
  CONSTRAINT psa_source_valid CHECK (source IN ('system','chatgpt','manual','import')),
  CONSTRAINT psa_uniq UNIQUE (project_id, artifact_type, version)
);

CREATE INDEX IF NOT EXISTS idx_psa_project_type
  ON public.prototype_studio_artifacts (project_id, artifact_type, version DESC);
CREATE INDEX IF NOT EXISTS idx_psa_active
  ON public.prototype_studio_artifacts (project_id, artifact_type)
  WHERE status IN ('active','approved');

-- ---------------------------------------------------------------------------
-- 3) Triggers — reuse handoff_touch_updated_at() (defined in 0105)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_psc_updated_at ON public.prototype_studio_configs;
CREATE TRIGGER trg_psc_updated_at BEFORE UPDATE ON public.prototype_studio_configs
FOR EACH ROW EXECUTE FUNCTION public.handoff_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS — قراءة لأي مستخدم مسجّل؛ الكتابة عبر server actions فقط (service role)
-- ---------------------------------------------------------------------------
ALTER TABLE public.prototype_studio_configs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prototype_studio_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psc_select ON public.prototype_studio_configs;
CREATE POLICY psc_select ON public.prototype_studio_configs
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS psa_select ON public.prototype_studio_artifacts;
CREATE POLICY psa_select ON public.prototype_studio_artifacts
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 5) Feature flag row — default OFF (legacy prototype_prompt يفضل الافتراضي)
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (name, description, enabled_globally, enabled_per_user)
VALUES (
  'prototype_studio',
  'Prototype Studio: 5-step workflow (Context/Scope/Design/Discuss/Build) — no AI API calls; manual ChatGPT+Codex handoff.',
  false,
  '{}'::uuid[]
)
ON CONFLICT (name) DO NOTHING;
