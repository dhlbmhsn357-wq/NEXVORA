/**
 * نسخة احتياطية خارجية — تصدير كامل لبيانات المشروع إلى ملفات محلية.
 *
 * التشغيل:
 * ```
 * npx tsx --env-file=.env.local scripts/backup-export.ts [مجلد الوجهة]
 * ```
 *
 * ## لماذا موجود مع وجود نسخ Supabase اليومية؟
 *
 * نسخ Supabase محفوظة **داخل Supabase**. لو ضاع الحساب، أو اتحذف
 * المشروع بالغلط، أو حصلت مشكلة فوترة — بتروح مع المشروع. النسخة اللي
 * في نفس المكان بتحمي من نوع واحد من الأعطال فقط.
 *
 * ## ما يشمله هذا التصدير
 *
 * - **كل صفوف كل جداول `public`** (بالترقيم، فحجم الجدول مش مشكلة)
 * - **مستخدمو المصادقة** عبر واجهة الإدارة (بلا كلمات مرور — Supabase
 *   لا يصدّرها أصلًا، وهي مُلحّنة على أي حال)
 * - **قائمة ملفات التخزين** (البيانات الوصفية لا الملفات نفسها)
 *
 * ## ما لا يشمله — بصراحة
 *
 * **بنية قاعدة البيانات (DDL)**: الجداول والدوال والسياسات والمُشغِّلات.
 * وده **مش نقص**: البنية كلها موجودة في `supabase/migrations/` داخل
 * Git، وهي مصدر الحقيقة لها. مسار الاسترجاع الكامل:
 *
 *   ١. مشروع Supabase جديد
 *   ٢. تشغيل الترحيلات بالترتيب  ← تبني البنية
 *   ٣. `backup-restore.ts`        ← يعيد البيانات
 *
 * **ملفات التخزين نفسها**: تُصدَّر أسماؤها فقط. تنزيل الملفات الثنائية
 * يضاعف الحجم والنقل الصادر، وهي قابلة لإعادة الرفع من مصادرها.
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";

const PAGE_SIZE = 1_000;

/** جداول لا قيمة لأرشفتها — سجلات مشتقّة تُعاد بناؤها. */
const SKIP_TABLES = new Set(["queue_metrics"]);

interface TableResult {
  table: string;
  rows: number;
  bytes: number;
  error?: string;
}

/**
 * أسماء الجداول من مواصفة OpenAPI اللي بتنشرها البوّابة.
 *
 * البديل — قراءة `information_schema` — مش متاح عبر PostgREST، وقائمة
 * ثابتة في الكود بتتقادم بصمت مع كل ترحيل جديد. المواصفة بتتولّد من
 * القاعدة نفسها، فهي دايمًا محدَّثة.
 */
async function listTables(url: string, serviceKey: string): Promise<string[]> {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) throw new Error(`تعذّر قراءة قائمة الجداول: ${response.status}`);

  const spec = (await response.json()) as { definitions?: Record<string, unknown> };
  return Object.keys(spec.definitions ?? {})
    .filter((t) => !SKIP_TABLES.has(t))
    .sort();
}

async function exportTable(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  outDir: string
): Promise<TableResult> {
  const rows: unknown[] = [];
  let from = 0;

  // الترقيم إلزامي: جدول كبير في نداء واحد بيتقطع عند حد PostgREST
  // بصمت، فالنسخة بتبان ناجحة وهي ناقصة — وده أسوأ من فشل صريح.
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { table, rows: 0, bytes: 0, error: error.message };
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const json = JSON.stringify(rows);
  const file = path.join(outDir, `${table}.json.gz`);
  await pipeline(Readable.from([json]), createGzip(), createWriteStream(file));

  return { table, rows: rows.length, bytes: Buffer.byteLength(json) };
}

async function exportAuthUsers(
  supabase: ReturnType<typeof createServiceClient>,
  outDir: string
): Promise<TableResult> {
  const all: unknown[] = [];
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { table: "auth.users", rows: 0, bytes: 0, error: error.message };
    if (!data.users.length) break;

    all.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      }))
    );

    if (data.users.length < 200) break;
    page += 1;
  }

  const json = JSON.stringify(all);
  await pipeline(
    Readable.from([json]),
    createGzip(),
    createWriteStream(path.join(outDir, "auth_users.json.gz"))
  );

  return { table: "auth.users", rows: all.length, bytes: Buffer.byteLength(json) };
}

async function exportStorageIndex(
  supabase: ReturnType<typeof createServiceClient>,
  outDir: string
): Promise<TableResult> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) return { table: "storage.index", rows: 0, bytes: 0, error: error.message };

  const index: Record<string, unknown[]> = {};
  let total = 0;

  for (const bucket of buckets ?? []) {
    const { data: files } = await supabase.storage
      .from(bucket.id)
      .list("", { limit: 10_000, sortBy: { column: "name", order: "asc" } });
    index[bucket.id] = files ?? [];
    total += files?.length ?? 0;
  }

  const json = JSON.stringify(index);
  await pipeline(
    Readable.from([json]),
    createGzip(),
    createWriteStream(path.join(outDir, "storage_index.json.gz"))
  );

  return { table: "storage.index", rows: total, bytes: Buffer.byteLength(json) };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1024 ** 2).toFixed(1)} م.ب`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("✗ متغيّرات Supabase ناقصة.");
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const root = process.argv[2] ?? path.join(process.cwd(), "backups");
  const outDir = path.join(root, stamp);
  await mkdir(outDir, { recursive: true });

  console.log(`\nالوجهة: ${outDir}\n`);

  const supabase = createServiceClient();
  const tables = await listTables(url, serviceKey);
  console.log(`اتلقى ${tables.length} جدول. جاري التصدير…\n`);

  const results: TableResult[] = [];

  for (const table of tables) {
    const result = await exportTable(supabase, table, outDir);
    results.push(result);
    if (result.error) {
      console.log(`  ✗ ${table.padEnd(38)} ${result.error}`);
    } else if (result.rows > 0) {
      console.log(
        `  ✓ ${table.padEnd(38)} ${String(result.rows).padStart(7)} صف   ${formatBytes(result.bytes)}`
      );
    }
  }

  results.push(await exportAuthUsers(supabase, outDir));
  results.push(await exportStorageIndex(supabase, outDir));

  const last = results.slice(-2);
  for (const r of last) {
    console.log(
      r.error
        ? `  ✗ ${r.table.padEnd(38)} ${r.error}`
        : `  ✓ ${r.table.padEnd(38)} ${String(r.rows).padStart(7)} عنصر ${formatBytes(r.bytes)}`
    );
  }

  const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const failed = results.filter((r) => r.error);
  const nonEmpty = results.filter((r) => r.rows > 0);

  // بيان يُكتب مع النسخة: نسخة بلا بيان لا يُعرف ما فيها ولا متى أُخذت.
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        projectUrl: url,
        tablesExported: nonEmpty.length,
        tablesEmpty: results.length - nonEmpty.length - failed.length,
        totalRows,
        uncompressedBytes: totalBytes,
        failures: failed.map((f) => ({ table: f.table, error: f.error })),
        note: "البيانات فقط. البنية في supabase/migrations داخل Git.",
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`\n${"─".repeat(56)}`);
  console.log(`الإجمالي: ${totalRows} صف · ${formatBytes(totalBytes)} قبل الضغط`);
  console.log(`جداول فيها بيانات: ${nonEmpty.length} من ${results.length}`);

  if (failed.length > 0) {
    console.log(`\n⚠ فشل ${failed.length} جدول — النسخة **ناقصة**:`);
    for (const f of failed) console.log(`   ${f.table}: ${f.error}`);
    process.exit(1);
  }

  console.log("\n✓ النسخة اكتملت.");
  console.log("  الاسترجاع: مشروع جديد ← تشغيل الترحيلات ← backup-restore.ts");
}

main().catch((err) => {
  console.error("\n✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
