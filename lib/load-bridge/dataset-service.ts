import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { executeChunk } from "@/lib/production-migration/execution-core";
import { uploadArtifact, downloadArtifact } from "@/lib/production-migration/storage";
import type { EntityPlan } from "@/lib/simulation/simulation-types";
import type { BusinessRule } from "@/lib/transformation/business-rules";
import { checksum } from "./reconciliation";
import { toJson } from "./serializers";
import type { LoadRow, DatasetSummary } from "./load-types";

/**
 * تثبيت مخرجات التحويل (Loaded Datasets) — **يُغلق فجوة الضخّ الجوهرية**:
 * المرحلة ٦ كانت تحسب الصفوف المُحوَّلة ثم تُهملها. هنا نُعيد اشتقاقها
 * حتميًّا (نفس `executeChunk`) ونُثبّتها كمخرجات جاهزة للحمل.
 *
 * حتميّ وآمن للاستئناف: يُعاد البناء الكامل عند الإنهاء من العيّنة نفسها،
 * فلا يهمّ كم مرّة تُوقِف/تستأنف — المخرجات دائمًا كاملة.
 */

const UNDEFINED_TABLE = "42P01";

/** يُعيد اشتقاق الصفوف المُحوَّلة لكل كيان ويُثبّتها. idempotent. */
export async function persistLoadedDatasets(
  executionId: string,
  projectId: string | null,
  byEntity: Map<string, EntityPlan>,
  businessRules: BusinessRule[],
  client?: SupabaseClient
): Promise<{ ok: boolean; datasets: number; rows: number; message?: string }> {
  const db = client ?? createServiceClient();

  // idempotent: امسح المُثبَّت السابق لهذا التنفيذ.
  try {
    await db.from("migration_loaded_datasets").delete().eq("execution_id", executionId);
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return { ok: false, datasets: 0, rows: 0, message: "جداول جسر الحمل غير مطبَّقة (طبّق ترحيل 0091)." };
    }
  }

  let datasets = 0;
  let totalRows = 0;

  for (const [entity, ep] of byEntity) {
    const res = executeChunk(ep.rules, businessRules, ep.rows);
    const rows = res.loaded;
    const json = toJson(rows);
    const key = `${projectId ?? "noproj"}/loaded/${executionId}/${entity}.json`;
    const artifact = await uploadArtifact(db, key, json);

    const ins = await db.from("migration_loaded_datasets").insert({
      execution_id: executionId,
      project_id: projectId,
      entity,
      label: ep.label ?? entity,
      format: "json",
      artifact_key: artifact?.path ?? "",
      inline_data: artifact ? null : rows,
      row_count: rows.length,
      checksum: checksum(json),
      size_bytes: artifact?.size ?? Buffer.byteLength(json, "utf8"),
      status: "ready",
    });
    if (ins.error) {
      if (ins.error.code === UNDEFINED_TABLE) return { ok: false, datasets, rows: totalRows, message: "جداول جسر الحمل غير مطبَّقة (طبّق ترحيل 0091)." };
      continue;
    }
    datasets += 1;
    totalRows += rows.length;
  }

  return { ok: true, datasets, rows: totalRows };
}

export interface LoadedDatasetRow {
  id: string;
  entity: string;
  label: string;
  row_count: number;
  checksum: string;
  size_bytes: number;
  artifact_key: string;
  status: string;
}

export async function listDatasets(executionId: string, client?: SupabaseClient): Promise<LoadedDatasetRow[]> {
  const db = client ?? createServiceClient();
  try {
    const { data } = await db
      .from("migration_loaded_datasets")
      .select("id, entity, label, row_count, checksum, size_bytes, artifact_key, status")
      .eq("execution_id", executionId)
      .order("entity", { ascending: true });
    return (data ?? []) as LoadedDatasetRow[];
  } catch {
    return [];
  }
}

export function toSummaries(rows: LoadedDatasetRow[]): DatasetSummary[] {
  return rows.map((r) => ({ entity: r.entity, label: r.label, rowCount: r.row_count, checksum: r.checksum, format: "json" }));
}

/** يجلب الصفوف الخام لكيان مُثبَّت (من التخزين أو المضمّن). */
export async function loadDatasetRows(datasetId: string, client?: SupabaseClient): Promise<LoadRow[]> {
  const db = client ?? createServiceClient();
  const { data } = await db.from("migration_loaded_datasets").select("artifact_key, inline_data").eq("id", datasetId).maybeSingle();
  const row = data as { artifact_key: string; inline_data: LoadRow[] | null } | null;
  if (!row) return [];
  if (row.inline_data) return row.inline_data;
  if (row.artifact_key) {
    const text = await downloadArtifact(db, row.artifact_key);
    if (text) {
      try {
        return JSON.parse(text) as LoadRow[];
      } catch {
        return [];
      }
    }
  }
  return [];
}
