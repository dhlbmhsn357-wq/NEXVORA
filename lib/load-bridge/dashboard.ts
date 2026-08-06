import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { listDatasets, type LoadedDatasetRow } from "./dataset-service";
import { listTargets, type SafeTargetRow } from "./target-service";
import { listTargetTypes } from "./target-adapters";
import type { TargetTypeDescriptor } from "./load-types";

/** حالة جسر الحمل لعملية تنفيذ — للعرض في لوحة الترحيل. */
export interface LoadRunRow {
  id: string;
  mode: string;
  format: string;
  status: string;
  total_rows: number;
  loaded_rows: number;
  reconciled: boolean;
  package_key: string;
  created_at: string;
}

export interface LoadBridgeState {
  datasets: LoadedDatasetRow[];
  datasetsTotal: number;
  targets: SafeTargetRow[];
  targetTypes: TargetTypeDescriptor[];
  runs: LoadRunRow[];
}

export async function getLoadBridgeState(executionId: string, projectId: string | null, client?: SupabaseClient): Promise<LoadBridgeState> {
  const db = client ?? createServiceClient();
  const datasets = await listDatasets(executionId, db);
  const targets = await listTargets(projectId, db);

  let runs: LoadRunRow[] = [];
  try {
    const { data } = await db
      .from("migration_load_runs")
      .select("id, mode, format, status, total_rows, loaded_rows, reconciled, package_key, created_at")
      .eq("execution_id", executionId)
      .order("created_at", { ascending: false })
      .limit(20);
    runs = (data ?? []) as LoadRunRow[];
  } catch {
    /* غير مطبَّق */
  }

  return {
    datasets,
    datasetsTotal: datasets.reduce((s, d) => s + d.row_count, 0),
    targets,
    targetTypes: listTargetTypes(),
    runs,
  };
}
