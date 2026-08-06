import { defineJobHandler } from "../registry";
import { createServiceClient } from "@/lib/supabase/service";
import { loadBackupDataset } from "@/lib/production-migration/backup-service";
import { runExecution } from "@/lib/production-migration/execution-service";

/**
 * معالج الترحيل الحقيقي في الطابور (Queue Engine path).
 *
 * `migration.execute` — ينفّذ عملية ترحيل معتمَدة خلفيًا عبر وقت تشغيل
 * العامل (0073): يعيد تغذية لقطة البيانات من النسخة الاحتياطية ويشغّل
 * محرّك التنفيذ (دفعات + تبعية + استئناف). بديل قابل للتوسّع لمسار
 * Auto-Chain الأمامي عند الترحيلات الكبيرة. آمن: يقفل على العملية الواحدة.
 */

export interface MigrationExecutePayload {
  executionId: string;
  projectId?: string | null;
}

export const MIGRATION_JOB_TYPES = {
  EXECUTE: "migration.execute",
} as const;

defineJobHandler<MigrationExecutePayload>({
  type: MIGRATION_JOB_TYPES.EXECUTE,
  workerType: "migration",
  concurrency: 1,
  timeoutMs: 300_000,
  maxAttempts: 3,
  defaultPriority: "high",
  lockKey: (p) => `migration_execution:${p.executionId}`,
  allowedRoles: ["owner", "admin"],
  description: "تنفيذ ترحيل حقيقي معتمَد على دفعات مرتّبة بالتبعية، قابل للاستئناف.",
  handler: async (ctx) => {
    const db = createServiceClient();
    const dataset = await loadBackupDataset(ctx.payload.executionId, db);
    if (!dataset) {
      await ctx.log("error", "تعذّر استرجاع لقطة البيانات من النسخة الاحتياطية.");
      return { result: { ok: false, reason: "no_backup_dataset" } };
    }
    await ctx.reportProgress(5, "بدء التنفيذ من النسخة الاحتياطية");
    await runExecution(ctx.payload.executionId, dataset, db);
    await ctx.reportProgress(100, "اكتمل مسار التنفيذ");
    return { result: { ok: true } };
  },
});
