/**
 * Prototype Studio — Config Service
 * =================================
 * Server-only. قراءة عبر authenticated client (RLS SELECT).
 * كتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_DESIGN_DIRECTION,
  type DesignDirection,
  type DesignReference,
  type PrototypeStudioConfigRow,
  type PrototypeType, type Platform, type Fidelity,
  type BackendRequirement, type DataStrategy,
} from "./types";

interface DbRow {
  project_id: string;
  prototype_type: string;
  prototype_goal: string;
  primary_personas: string[] | null;
  core_flows: string[] | null;
  platform: string;
  fidelity: string;
  language: string;
  is_rtl: boolean;
  backend_requirement: string;
  data_strategy: string;
  in_scope_items: string[] | null;
  out_of_scope_items: string[] | null;
  design_direction: Partial<DesignDirection> | null;
  design_references: DesignReference[] | null;
  updated_at: string;
  updated_by: string | null;
}

function mapRow(r: DbRow): PrototypeStudioConfigRow {
  const dd = r.design_direction ?? {};
  return {
    projectId: r.project_id,
    prototypeType: r.prototype_type as PrototypeType,
    prototypeGoal: r.prototype_goal,
    primaryPersonas: Array.isArray(r.primary_personas) ? r.primary_personas : [],
    coreFlows: Array.isArray(r.core_flows) ? r.core_flows : [],
    platform: r.platform as Platform,
    fidelity: r.fidelity as Fidelity,
    language: r.language,
    isRtl: r.is_rtl,
    backendRequirement: r.backend_requirement as BackendRequirement,
    dataStrategy: r.data_strategy as DataStrategy,
    inScopeItems: Array.isArray(r.in_scope_items) ? r.in_scope_items : [],
    outOfScopeItems: Array.isArray(r.out_of_scope_items) ? r.out_of_scope_items : [],
    designDirection: { ...DEFAULT_DESIGN_DIRECTION, ...dd },
    designReferences: Array.isArray(r.design_references) ? r.design_references : [],
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

/** يعرّف قيم افتراضية لصف غير موجود بعد. */
function defaultConfig(projectId: string): PrototypeStudioConfigRow {
  return {
    projectId,
    prototypeType: "clickable",
    prototypeGoal: "",
    primaryPersonas: [],
    coreFlows: [],
    platform: "web",
    fidelity: "mid",
    language: "ar",
    isRtl: true,
    backendRequirement: "mocked",
    dataStrategy: "mock",
    inScopeItems: [],
    outOfScopeItems: [],
    designDirection: { ...DEFAULT_DESIGN_DIRECTION },
    designReferences: [],
    updatedAt: new Date(0).toISOString(),
    updatedBy: null,
  };
}

export async function getConfig(projectId: string): Promise<PrototypeStudioConfigRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prototype_studio_configs")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultConfig(projectId);
  return mapRow(data as DbRow);
}

export interface SaveConfigPatch {
  prototypeType?: PrototypeType;
  prototypeGoal?: string;
  primaryPersonas?: string[];
  coreFlows?: string[];
  platform?: Platform;
  fidelity?: Fidelity;
  language?: string;
  isRtl?: boolean;
  backendRequirement?: BackendRequirement;
  dataStrategy?: DataStrategy;
  inScopeItems?: string[];
  outOfScopeItems?: string[];
  designDirection?: DesignDirection;
  designReferences?: DesignReference[];
}

export async function saveConfig(
  projectId: string,
  patch: SaveConfigPatch,
  userId: string | null,
): Promise<PrototypeStudioConfigRow> {
  const supabase = createServiceClient();
  const upsertPayload: Record<string, unknown> = { project_id: projectId, updated_by: userId };
  if (patch.prototypeType !== undefined) upsertPayload.prototype_type = patch.prototypeType;
  if (patch.prototypeGoal !== undefined) upsertPayload.prototype_goal = patch.prototypeGoal;
  if (patch.primaryPersonas !== undefined) upsertPayload.primary_personas = patch.primaryPersonas;
  if (patch.coreFlows !== undefined) upsertPayload.core_flows = patch.coreFlows;
  if (patch.platform !== undefined) upsertPayload.platform = patch.platform;
  if (patch.fidelity !== undefined) upsertPayload.fidelity = patch.fidelity;
  if (patch.language !== undefined) upsertPayload.language = patch.language;
  if (patch.isRtl !== undefined) upsertPayload.is_rtl = patch.isRtl;
  if (patch.backendRequirement !== undefined) upsertPayload.backend_requirement = patch.backendRequirement;
  if (patch.dataStrategy !== undefined) upsertPayload.data_strategy = patch.dataStrategy;
  if (patch.inScopeItems !== undefined) upsertPayload.in_scope_items = patch.inScopeItems;
  if (patch.outOfScopeItems !== undefined) upsertPayload.out_of_scope_items = patch.outOfScopeItems;
  if (patch.designDirection !== undefined) upsertPayload.design_direction = patch.designDirection;
  if (patch.designReferences !== undefined) upsertPayload.design_references = patch.designReferences;

  const { data, error } = await supabase
    .from("prototype_studio_configs")
    .upsert(upsertPayload, { onConflict: "project_id" })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as DbRow);
}
