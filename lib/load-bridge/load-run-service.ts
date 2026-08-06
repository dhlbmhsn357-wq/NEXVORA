import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildLoadPackage, formatForTarget, type BuildPackageResult } from "./load-package-service";
import { describeTarget, isTargetConfigured } from "./target-adapters";
import { listDatasets, loadDatasetRows } from "./dataset-service";
import { runDirectLoad, type EntityRows } from "./connectors";
import type { LoadFormat } from "./load-types";

/**
 * تنسيق عملية الحمل — يختار المسار حسب نوع الوجهة:
 *
 * - **وجهة ملف** (sql_file/csv_bundle) أو بلا وجهة → تصدير حزمة قابلة
 *   للتنزيل (يعمل اليوم بلا أي بيانات اعتماد).
 * - **وجهة مباشرة مُهيَّأة** (rest_api/supabase) → **حقن فعليّ** عبر الموصّل
 *   (HTTP أو Supabase)، على دفعات، مع مطابقة الأعداد المكتوبة فعليًّا.
 * - **وجهة مباشرة غير مُهيَّأة** أو نوع بلا موصّل بعد (postgres) → حزمة
 *   تصدير كبديل + رسالة صريحة (لا ادّعاء كتابة لم تحدث).
 */
export async function runLoad(
  executionId: string,
  targetId: string | null,
  requestedFormat: LoadFormat,
  actorId: string | null,
  client?: SupabaseClient
): Promise<BuildPackageResult> {
  const db = client ?? createServiceClient();

  if (!targetId) {
    return buildLoadPackage(executionId, requestedFormat, actorId, null, "export", null, db);
  }

  const { data } = await db.from("migration_load_targets").select("target_type, config, secret_encrypted").eq("id", targetId).maybeSingle();
  const target = data as { target_type: string; config: Record<string, unknown>; secret_encrypted: string | null } | null;
  if (!target) return { ok: false, message: "الوجهة غير موجودة." };

  const def = describeTarget(target.target_type);
  const format = formatForTarget(target.target_type, requestedFormat);

  // وجهة ملف → تصدير عادي.
  if (def && !def.realtime) {
    return buildLoadPackage(executionId, format, actorId, targetId, "export", null, db);
  }

  const configured = isTargetConfigured(target.target_type, target.config ?? {}, Boolean(target.secret_encrypted));

  // وجهة مباشرة غير مُهيَّأة → حزمة تصدير كبديل.
  if (!configured) {
    const r = await buildLoadPackage(executionId, format, actorId, targetId, "export", null, db);
    return { ...r, message: "الوجهة غير مُهيَّأة بالكامل — بُنيت حزمة تصدير كبديل. أكمِل الإعداد والسرّ لتفعيل الحقن المباشر." };
  }

  // نوع بلا موصّل حقيقي بعد (postgres يحتاج موصّل نشر معزول).
  if (target.target_type === "postgres") {
    const r = await buildLoadPackage(executionId, format, actorId, targetId, "direct", { loadedByEntity: {}, failedByEntity: {}, errors: ["اتصال Postgres المباشر يُنفَّذ عبر موصّل نشر معزول (غير متاح من بيئة التطبيق). بُنيت حزمة تصدير كبديل."] }, db);
    return { ...r, message: "Postgres المباشر عبر موصّل النشر المعزول — بُنيت حزمة تصدير كبديل." };
  }

  // حقن مباشر فعليّ (rest_api / supabase).
  const datasets = await listDatasets(executionId, db);
  const entities: EntityRows[] = [];
  for (const d of datasets) entities.push({ entity: d.entity, rows: await loadDatasetRows(d.id, db) });

  const direct = await runDirectLoad(target.target_type, target.config ?? {}, target.secret_encrypted, entities);
  const result = await buildLoadPackage(executionId, format, actorId, targetId, "direct", {
    loadedByEntity: direct.loadedByEntity, failedByEntity: direct.failedByEntity, errors: direct.errors,
  }, db);

  const loaded = Object.values(direct.loadedByEntity).reduce((s, n) => s + n, 0);
  const message = direct.ok
    ? `تمّ الحقن المباشر بنجاح: ${loaded} صفًّا.`
    : `حقن مباشر جزئيّ: ${loaded} صفًّا · ${direct.errors.length} خطأ. ${direct.errors[0] ?? ""}`;
  return { ...result, message };
}
