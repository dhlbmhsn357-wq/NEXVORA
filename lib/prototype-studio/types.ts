/**
 * Prototype Studio — Types
 * ========================
 * نماذج بيانات موحّدة لطبقة Studio. تعيين snake_case ↔ camelCase.
 */

export const PROTOTYPE_TYPES = ["clickable", "functional", "poc"] as const;
export type PrototypeType = (typeof PROTOTYPE_TYPES)[number];

export const PROTOTYPE_PLATFORMS = ["web", "mobile", "both", "desktop"] as const;
export type Platform = (typeof PROTOTYPE_PLATFORMS)[number];

export const PROTOTYPE_FIDELITIES = ["low", "mid", "high"] as const;
export type Fidelity = (typeof PROTOTYPE_FIDELITIES)[number];

export const PROTOTYPE_BACKEND_REQUIREMENTS = ["none", "mocked", "minimal_functional"] as const;
export type BackendRequirement = (typeof PROTOTYPE_BACKEND_REQUIREMENTS)[number];

export const PROTOTYPE_DATA_STRATEGIES = ["mock", "real"] as const;
export type DataStrategy = (typeof PROTOTYPE_DATA_STRATEGIES)[number];

export const UI_DENSITIES = ["comfortable", "compact", "spacious"] as const;
export type UiDensity = (typeof UI_DENSITIES)[number];

export interface BrandColor { name: string; hex: string; }
export interface Typography { heading: string; body: string; sizes: string; }
export interface DesignDirection {
  visual_style: string;
  brand_colors: BrandColor[];
  typography: Typography;
  ui_density: UiDensity;
  layout_preference: string;
  navigation_preference: string;
  accessibility_notes: string;
}
export interface DesignReference {
  url: string;
  screenshot_url: string | null;
  liked: string;
  avoid: string;
  notes: string;
}

export const DEFAULT_DESIGN_DIRECTION: DesignDirection = {
  visual_style: "",
  brand_colors: [],
  typography: { heading: "", body: "", sizes: "" },
  ui_density: "comfortable",
  layout_preference: "",
  navigation_preference: "",
  accessibility_notes: "",
};

export interface PrototypeStudioConfigRow {
  projectId: string;
  prototypeType: PrototypeType;
  prototypeGoal: string;
  primaryPersonas: string[];
  coreFlows: string[];
  platform: Platform;
  fidelity: Fidelity;
  language: string;
  isRtl: boolean;
  backendRequirement: BackendRequirement;
  dataStrategy: DataStrategy;
  inScopeItems: string[];
  outOfScopeItems: string[];
  designDirection: DesignDirection;
  designReferences: DesignReference[];
  updatedAt: string;
  updatedBy: string | null;
}

export const ARTIFACT_TYPES = ["context_pack", "build_brief", "codex_build_pack"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ["draft", "active", "approved", "superseded"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const ARTIFACT_SOURCES = ["system", "chatgpt", "manual", "import"] as const;
export type ArtifactSource = (typeof ARTIFACT_SOURCES)[number];

export interface ArtifactMetadata {
  pinned_prd_version: number | null;
  pinned_brain_version: number | null;
  pinned_config_updated_at: string | null;
  chatgpt_session_ref: string | null;
  source_details: string | null;
}

export const DEFAULT_ARTIFACT_METADATA: ArtifactMetadata = {
  pinned_prd_version: null,
  pinned_brain_version: null,
  pinned_config_updated_at: null,
  chatgpt_session_ref: null,
  source_details: null,
};

export interface PrototypeStudioArtifactRow {
  id: string;
  projectId: string;
  artifactType: ArtifactType;
  version: number;
  status: ArtifactStatus;
  contentMd: string;
  metadata: ArtifactMetadata;
  source: ArtifactSource;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string;
}

export interface StudioReadiness {
  score: number; // 0..100
  missing: string[];
  recommended: string[];
}
