import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadArtifact } from "./storage";
import { redactSecrets } from "./audit";

/**
 * النسخة الاحتياطية الإلزامية (Mandatory Backup) — قبل أول سجلّ. تلتقط
 * **تعريف الترحيل** (Blueprint + القواعد المعتمَدة + العلاقات + ملخّص
 * المحاكاة) + لقطة بيانات المصدر المُقدَّمة — أساس الاستعادة والاستئناف.
 * **الأسرار منقّاة (REDACTED).** رشيق: يتدهور لتخزين البيان في DB لو غاب
 * الـbucket.
 */

export interface BackupOutcome {
  ok: boolean;
  backupId?: string;
  message?: string;
}

export async function createBackup(executionId: string, sourceId: string, datasetContent: string, actorId: string | null, client?: SupabaseClient): Promise<BackupOutcome> {
  const db = client ?? createServiceClient();
  const startedAt = Date.now();

  // اجمع تعريف الترحيل (بنية فقط + ملخّصات — بلا صفوف خام في البيان).
  const pipe = await db.from("transformation_pipelines").select("id, blueprint_id, domain, report").eq("source_id", sourceId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  const pipeline = pipe.data as { id: string; blueprint_id: string | null; domain: string; report: unknown } | null;

  const [rules, brules, sim] = await Promise.all([
    db.from("transformation_rules").select("target_field, kind, config, condition, source_fields").eq("pipeline_id", pipeline?.id ?? "").eq("status", "approved"),
    db.from("transformation_business_rules").select("entity, title, condition, action").eq("pipeline_id", pipeline?.id ?? ""),
    db.from("migration_simulations").select("id, approval_score, readiness_verdict, report").eq("source_id", sourceId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const manifest = redactSecrets({
    generatedFor: executionId,
    sourceId,
    pipelineId: pipeline?.id ?? null,
    domain: pipeline?.domain ?? "generic",
    approvedRules: rules.data ?? [],
    businessRules: brules.data ?? [],
    simulation: sim.data ? { id: (sim.data as { id: string }).id, score: (sim.data as { approval_score: number }).approval_score } : null,
  });

  // ارفع لقطة البيانات + البيان (لإتاحة الاستئناف بعد إعادة التشغيل).
  const key = `${sourceId}/${executionId}/backup.json`;
  const artifact = await uploadArtifact(db, key, JSON.stringify({ manifest, dataset: datasetContent }));

  const scope: Record<string, unknown> = {
    includes: ["blueprint", "approved_rules", "business_rules", "simulation_summary", "dataset_snapshot"],
    manifest,
    // fallback: خزّن البيانات في DB لو تعذّر الرفع (بلا صفوف خام حسّاسة — لقطة المصدر المُقدَّمة).
    inlineDataset: artifact ? null : datasetContent,
  };

  const ins = await db
    .from("migration_backups")
    .insert({
      execution_id: executionId,
      source_id: sourceId,
      backup_key: artifact?.path ?? `inline:${executionId}`,
      scope,
      size_bytes: artifact?.size ?? Buffer.byteLength(datasetContent, "utf8"),
      duration_ms: Date.now() - startedAt,
      restore_command: artifact ? `velora migration restore --backup ${key}` : `velora migration restore --execution ${executionId} --from-db`,
      status: "ready",
    })
    .select("id")
    .maybeSingle();

  if (ins.error || !ins.data) return { ok: false, message: ins.error?.message ?? "فشل إنشاء النسخة الاحتياطية." };
  const backupId = (ins.data as { id: string }).id;
  await db.from("migration_executions").update({ backup_id: backupId }).eq("id", executionId);
  void actorId;
  return { ok: true, backupId };
}

/** يعيد لقطة البيانات من النسخة الاحتياطية (للاستئناف بعد إعادة التشغيل). */
export async function loadBackupDataset(executionId: string, client?: SupabaseClient): Promise<string | null> {
  const db = client ?? createServiceClient();
  const { data } = await db.from("migration_backups").select("backup_key, scope").eq("execution_id", executionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const row = data as { backup_key: string; scope: { inlineDataset?: string | null } };
  if (row.scope?.inlineDataset) return row.scope.inlineDataset;
  if (row.backup_key && !row.backup_key.startsWith("inline:")) {
    const { downloadArtifact } = await import("./storage");
    const text = await downloadArtifact(db, row.backup_key);
    if (text) {
      try {
        return (JSON.parse(text) as { dataset?: string }).dataset ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
