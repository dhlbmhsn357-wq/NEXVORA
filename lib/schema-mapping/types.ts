/** أنواع صفوف جداول محرّك الـMapping (٠٠٨٤). */

export type BlueprintStatus = "draft" | "in_review" | "approved" | "failed" | "generating";
export type MappingStatus = "pending" | "approved" | "rejected";

export interface BlueprintRow {
  id: string;
  source_id: string | null;
  snapshot_id: string | null;
  project_id: string | null;
  status: BlueprintStatus;
  version: number;
  confidence_avg: number;
  complexity: string;
  detected_template: string | null;
  stats: Record<string, unknown>;
  ai_summary: string;
  recommendations: string[];
  promoted_to_org_memory: boolean;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityMappingRow {
  id: string;
  blueprint_id: string;
  old_objects: string[];
  canonical_entity: string;
  canonical_label: string;
  confidence: number;
  reason: string;
  alternatives: unknown;
  status: MappingStatus;
}

export interface FieldMappingRow {
  id: string;
  blueprint_id: string;
  old_object: string;
  old_field: string;
  new_entity: string;
  new_field: string | null;
  new_field_label: string | null;
  kind: string;
  transformation: Record<string, unknown>;
  confidence: number;
  reason: string;
  suggestions: unknown;
  status: MappingStatus;
}

export interface MappingOutcome {
  ok: boolean;
  blueprintId?: string;
  message?: string;
}
