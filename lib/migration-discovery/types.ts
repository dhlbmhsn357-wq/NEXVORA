import type { ConnectionMode } from "./source-types";
import type { NormalizedSchema } from "./schema-model";
import type { DetectedEntity } from "./semantic-detection";
import type { DetectedRelationship } from "./relationship-intelligence";

/** أنواع صفوف جداول منصّة اكتشاف الترحيل (٠٠٨٣). */

export type SourceStatus = "draft" | "connected" | "analyzing" | "analyzed" | "failed" | "disabled";
export type SnapshotStatus = "pending" | "extracting" | "analyzing" | "completed" | "failed";

export interface MigrationSourceRow {
  id: string;
  project_id: string | null;
  name: string;
  source_type: string;
  connection_mode: ConnectionMode;
  status: SourceStatus;
  connection_config: Record<string, unknown>;
  secret_encrypted: string | null;
  last_connection_test: ConnectionTestSnapshot | null;
  last_tested_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionTestSnapshot {
  ok: boolean;
  configured: boolean;
  durationMs: number;
  version: string | null;
  dbType: string | null;
  tableCount: number;
  approxSize: string | null;
  issues: string[];
}

export interface MigrationSnapshotRow {
  id: string;
  source_id: string;
  project_id: string | null;
  version: number;
  status: SnapshotStatus;
  progress: number;
  checkpoint: Record<string, unknown> | null;
  raw_schema: NormalizedSchema;
  stats: Record<string, unknown>;
  error: string | null;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MigrationReportRow {
  id: string;
  snapshot_id: string;
  source_id: string;
  project_id: string | null;
  detected_domains: string[];
  system_type: string;
  quality_score: number;
  risk_score: number;
  readiness_score: number;
  detail: Record<string, unknown>;
  ai_summary: string;
  promoted_to_org_memory: boolean;
  created_at: string;
}

export interface MigrationEntityRow {
  canonical_entity: string;
  display_name: string;
  data_class: string;
  source_objects: string[];
  confidence: number;
}

/** مُدخَل تسجيل مصدر جديد (من الـWizard). */
export interface RegisterSourceInput {
  projectId: string | null;
  name: string;
  sourceType: string;
  connectionMode: ConnectionMode;
  connectionConfig: Record<string, unknown>;
  /** السرّ الخام (سيُشفَّر قبل الحفظ ولا يُخزَّن نصًّا). */
  secret?: string | null;
}

/** نتيجة تشغيل تحليل — تُعاد للواجهة. */
export interface AnalysisOutcome {
  ok: boolean;
  snapshotId?: string;
  reportId?: string;
  message?: string;
}

export type { NormalizedSchema, DetectedEntity, DetectedRelationship };
