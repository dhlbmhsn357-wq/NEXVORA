import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadArtifact, signedUrl } from "@/lib/production-migration/storage";
import { listDatasets, loadDatasetRows, toSummaries } from "./dataset-service";
import { serialize } from "./serializers";
import { reconcile, buildManifest } from "./reconciliation";
import { describeTarget } from "./target-adapters";
import { notifyLoad } from "./notify";
import type { LoadFormat, ReconciliationResult, PackageManifest } from "./load-types";

/**
 * بناء حزمة الحمل — يقرأ المخرجات المُثبَّتة (dataset-service)، يُسلسلها
 * بالصيغة المطلوبة **بترتيب التبعية** (الأب قبل الابن)، يجمعها في حزمة
 * واحدة قابلة للتنزيل، ويُطابق الأعداد مع ما رحّله التنفيذ فعليًّا.
 *
 * هذه هي الصورة العمليّة لإغلاق فجوة الضخّ للعميل: مخرجات مُتحقَّق منها،
 * مُرتّبة، وجاهزة للاستيراد في أي ERP يقبل SQL/CSV/JSON.
 */

const FALLBACK_ORDER = 9999;

/** يشتقّ ترتيب الكيانات من خطة التبعية المحفوظة في التنفيذ. */
function orderMap(detail: unknown): Record<string, number> {
  const plan = (detail as { dependencyPlan?: Array<{ entity: string; order?: number }> })?.dependencyPlan;
  const map: Record<string, number> = {};
  if (Array.isArray(plan)) plan.forEach((e, i) => { map[e.entity] = e.order ?? i; });
  return map;
}

/** الأعداد المتوقَّعة لكل كيان — من مهام التنفيذ (مجموع المُرحَّل). */
async function expectedByEntity(db: SupabaseClient, executionId: string): Promise<Record<string, number>> {
  const { data } = await db.from("migration_execution_tasks").select("entity, migrated").eq("execution_id", executionId);
  const rows = (data ?? []) as Array<{ entity: string; migrated: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.entity] = (out[r.entity] ?? 0) + (r.migrated ?? 0);
  return out;
}

export interface BuildPackageResult {
  ok: boolean;
  runId?: string;
  signedUrl?: string | null;
  manifest?: PackageManifest;
  reconciliation?: ReconciliationResult;
  message?: string;
}

/** نتيجة حمل مباشر فعليّة (تُستخدم لأعداد المطابقة بدل أعداد التصدير). */
export interface DirectOverride {
  loadedByEntity: Record<string, number>;
  failedByEntity: Record<string, number>;
  errors: string[];
}

export async function buildLoadPackage(
  executionId: string,
  format: LoadFormat,
  actorId: string | null,
  targetId: string | null,
  mode: "export" | "direct",
  directOverride: DirectOverride | null = null,
  client?: SupabaseClient
): Promise<BuildPackageResult> {
  const db = client ?? createServiceClient();

  const exec = await db.from("migration_executions").select("project_id, status, detail, migrated_rows").eq("id", executionId).maybeSingle();
  const e = exec.data as { project_id: string | null; status: string; detail: unknown; migrated_rows: number } | null;
  if (!e) return { ok: false, message: "عملية التنفيذ غير موجودة." };
  if (e.status !== "completed") return { ok: false, message: "لا تُبنى الحزمة إلا بعد اكتمال الترحيل الحقيقي (المرحلة ٦)." };

  const datasets = await listDatasets(executionId, db);
  if (datasets.length === 0) return { ok: false, message: "لا مخرجات مُثبَّتة — أعِد تشغيل الترحيل بعد تطبيق ترحيل 0091." };

  const order = orderMap(e.detail);
  const ordered = [...datasets].sort((a, b) => (order[a.entity] ?? FALLBACK_ORDER) - (order[b.entity] ?? FALLBACK_ORDER));

  // سلسِل كل كيان بالصيغة المطلوبة (اسم الكيان = اسم الجدول لـ SQL).
  const files: Record<string, string> = {};
  const combinedSql: string[] = [];
  const loadedCounts: Record<string, number> = {};
  const ext = format === "sql" ? "sql" : format === "csv" ? "csv" : "json";

  for (const ds of ordered) {
    const rows = await loadDatasetRows(ds.id, db);
    loadedCounts[ds.entity] = rows.length;
    const content = serialize(format, ds.entity, rows, { onConflictDoNothing: true });
    files[`${ds.entity}.${ext}`] = content;
    if (format === "sql") combinedSql.push(`-- ${ds.label} (${ds.entity}) — ${rows.length} صفّ\n${content}`);
  }
  if (format === "sql") files["_combined.sql"] = combinedSql.join("\n");

  const summaries = toSummaries(ordered);
  const manifest = buildManifest(format, summaries);

  // في الحمل المباشر: طابِق أعداد الكتابة الفعلية (لا أعداد التصدير).
  const effectiveLoaded = directOverride ? directOverride.loadedByEntity : loadedCounts;
  const reconciliation = reconcile(await expectedByEntity(db, executionId), effectiveLoaded);
  const failedTotal = directOverride
    ? Object.values(directOverride.failedByEntity).reduce((s, n) => s + n, 0)
    : Math.max(0, reconciliation.totalExpected - reconciliation.totalLoaded);
  const runStatus = directOverride && reconciliation.totalLoaded === 0 && reconciliation.totalExpected > 0
    ? "failed"
    : reconciliation.reconciled && failedTotal === 0
      ? "completed"
      : "partial";

  // أنشئ صفّ عملية الحمل.
  const runIns = await db.from("migration_load_runs").insert({
    execution_id: executionId, project_id: e.project_id, target_id: targetId, mode, format,
    status: runStatus,
    total_rows: reconciliation.totalExpected, loaded_rows: reconciliation.totalLoaded,
    failed_rows: failedTotal,
    reconciled: reconciliation.reconciled && failedTotal === 0, reconciliation,
    started_by: actorId, started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).select("id").maybeSingle();
  if (runIns.error || !runIns.data) {
    if (runIns.error?.code === "42P01") return { ok: false, message: "جداول جسر الحمل غير مطبَّقة (طبّق ترحيل 0091)." };
    return { ok: false, message: runIns.error?.message ?? "فشل إنشاء عملية الحمل." };
  }
  const runId = (runIns.data as { id: string }).id;

  // ارفع الحزمة كـartifact واحد + بيان.
  const packageKey = `${e.project_id ?? "noproj"}/packages/${runId}.json`;
  const artifact = await uploadArtifact(db, packageKey, JSON.stringify({ manifest, reconciliation, files }, null, 2));
  await db.from("migration_load_runs").update({
    package_key: artifact?.path ?? "",
    error: directOverride && directOverride.errors.length ? directOverride.errors.slice(0, 20).join(" · ") : null,
    detail: {
      fileCount: Object.keys(files).length, format, ordered: ordered.map((d) => d.entity), stored: Boolean(artifact),
      ...(directOverride ? { directErrors: directOverride.errors.slice(0, 50), failedByEntity: directOverride.failedByEntity } : {}),
    },
  }).eq("id", runId);

  const url = artifact ? await signedUrl(db, artifact.path) : null;

  if (runStatus === "failed" || (directOverride && failedTotal > 0)) {
    await notifyLoad("load_partial", runId, directOverride?.errors[0] ?? `فشل حمل ${failedTotal} صفًّا.`, e.project_id);
  } else if (!reconciliation.reconciled) {
    await notifyLoad("reconcile_mismatch", runId, `فرق في الأعداد: ${reconciliation.mismatches.join(" · ")}`, e.project_id);
  } else if (mode === "direct") {
    await notifyLoad("package_ready", runId, `تمّ الحقن المباشر: ${reconciliation.totalLoaded} صفًّا عبر ${ordered.length} كيان.`, e.project_id);
  } else {
    await notifyLoad("package_ready", runId, `حزمة ${format.toUpperCase()} جاهزة (${reconciliation.totalLoaded} صفًّا عبر ${ordered.length} كيان).`, e.project_id);
  }

  return { ok: true, runId, signedUrl: url, manifest, reconciliation };
}

/** رابط تنزيل موقّع جديد لحزمة عملية حمل قائمة (الروابط تنتهي بسرعة). */
export async function getPackageUrl(runId: string, client?: SupabaseClient): Promise<string | null> {
  const db = client ?? createServiceClient();
  const { data } = await db.from("migration_load_runs").select("package_key").eq("id", runId).maybeSingle();
  const key = (data as { package_key: string } | null)?.package_key;
  if (!key) return null;
  return signedUrl(db, key);
}

/** يفحص إن كانت الصيغة مناسبة لنوع الوجهة (لو مُرِّرت وجهة). */
export function formatForTarget(targetType: string | null, requested: LoadFormat): LoadFormat {
  if (!targetType) return requested;
  const d = describeTarget(targetType);
  return d ? d.format : requested;
}
