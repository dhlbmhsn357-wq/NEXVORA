/**
 * استرجاع نسخة احتياطية — يكتب البيانات في قاعدة **بنيتها جاهزة**.
 *
 * التشغيل:
 * ```
 * npx tsx --env-file=.env.local scripts/backup-restore.ts <مجلد النسخة> --confirm
 * ```
 *
 * ## الترتيب الصحيح للاسترجاع
 *
 * ١. مشروع Supabase جديد (أو نفس المشروع بعد إعادة تهيئته)
 * ٢. تشغيل كل الترحيلات من `supabase/migrations/` بالترتيب
 * ٣. هذا السكربت
 *
 * البنية **ليست** في النسخة عن قصد — مصدرها Git، وهو مصدر أفضل: مُراجَع
 * ومُؤرَّخ ولا يتقادم.
 *
 * ## لماذا عدة مرات لا مرة واحدة
 *
 * الجداول مرتبطة بمفاتيح أجنبية، والكتابة بترتيب خاطئ تفشل. استخراج
 * ترتيب التبعيات يحتاج قراءة `information_schema` وهي غير متاحة عبر
 * PostgREST. فالسكربت يمرّ عدة مرات: كل مرة يكتب ما ينجح ويؤجّل ما يفشل،
 * ويتوقّف حين تتوقّف الإضافة. النتيجة نفسها بلا الحاجة لخريطة التبعيات.
 *
 * ## حواجز الأمان
 *
 * - **`--confirm` إلزامي.** الكتابة على قاعدة بيانات لا تحدث بالخطأ.
 * - **يرفض قاعدة فيها بيانات** ما لم يُمرَّر `--force` صراحةً.
 * - يطبع خطة العمل كاملة قبل أول كتابة.
 */

import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_PASSES = 8;
const CHUNK = 200;

/** لا تُستعاد: تُدار من Supabase نفسها أو تُعاد بناؤها. */
const SKIP = new Set(["auth_users", "storage_index", "manifest"]);

interface Pending {
  table: string;
  rows: Record<string, unknown>[];
  lastError?: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  return {
    dir,
    confirm: args.includes("--confirm"),
    force: args.includes("--force"),
  };
}

async function loadBackup(dir: string): Promise<Pending[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json.gz"));
  const pending: Pending[] = [];

  for (const file of files) {
    const table = file.replace(/\.json\.gz$/, "");
    if (SKIP.has(table)) continue;

    const raw = gunzipSync(await readFile(path.join(dir, file))).toString("utf-8");
    const rows = JSON.parse(raw) as Record<string, unknown>[];
    if (rows.length > 0) pending.push({ table, rows });
  }

  return pending.sort((a, b) => a.table.localeCompare(b.table));
}

async function main() {
  const { dir, confirm, force } = parseArgs();

  if (!dir) {
    console.error("الاستخدام: backup-restore.ts <مجلد النسخة> --confirm [--force]");
    process.exit(1);
  }

  const manifestRaw = await readFile(path.join(dir, "manifest.json"), "utf-8").catch(() => null);
  if (!manifestRaw) {
    console.error(`✗ مفيش manifest.json في ${dir} — ده مش مجلد نسخة صالح.`);
    process.exit(1);
  }
  const manifest = JSON.parse(manifestRaw) as { takenAt: string; totalRows: number };

  const pending = await loadBackup(dir);
  const totalRows = pending.reduce((sum, p) => sum + p.rows.length, 0);

  console.log(`\nالنسخة:      ${dir}`);
  console.log(`تاريخها:     ${manifest.takenAt}`);
  console.log(`المحتوى:     ${pending.length} جدول · ${totalRows} صف`);
  console.log(`الوجهة:      ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  if (!confirm) {
    console.log("عرض فقط — مفيش أي كتابة.");
    console.log("للتنفيذ الفعلي ضيف --confirm.\n");
    for (const p of pending.slice(0, 15)) {
      console.log(`  ${p.table.padEnd(38)} ${String(p.rows.length).padStart(6)} صف`);
    }
    if (pending.length > 15) console.log(`  … و${pending.length - 15} جدول تاني`);
    return;
  }

  const supabase = createServiceClient();

  // حاجز: قاعدة فيها بيانات مش وجهة استرجاع إلا بقرار صريح.
  const { count: existingProjects } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  if ((existingProjects ?? 0) > 0 && !force) {
    console.error(
      `✗ القاعدة الهدف فيها ${existingProjects} مشروع بالفعل.\n` +
        `  الاسترجاع فوق بيانات قائمة ممكن يدمج نسختين مختلفتين.\n` +
        `  لو ده مقصود، أعد التشغيل بـ --force.`
    );
    process.exit(1);
  }

  console.log("جاري الاسترجاع…\n");

  let remaining = pending;
  const restored = new Map<string, number>();

  for (let pass = 1; pass <= MAX_PASSES && remaining.length > 0; pass++) {
    const stillPending: Pending[] = [];
    let progressed = 0;

    for (const item of remaining) {
      let ok = true;
      let lastError = "";

      for (let i = 0; i < item.rows.length; i += CHUNK) {
        const { error } = await supabase
          .from(item.table)
          .upsert(item.rows.slice(i, i + CHUNK), { onConflict: "id" });
        if (error) {
          ok = false;
          lastError = error.message;
          break;
        }
      }

      if (ok) {
        restored.set(item.table, item.rows.length);
        progressed += 1;
        console.log(`  ✓ ${item.table.padEnd(38)} ${String(item.rows.length).padStart(6)} صف`);
      } else {
        stillPending.push({ ...item, lastError });
      }
    }

    remaining = stillPending;

    // مفيش تقدّم = الباقي محجوب بسبب حقيقي مش ترتيب. التوقّف أصدق من
    // الدوران حتى نهاية المرّات.
    if (progressed === 0) break;
    if (remaining.length > 0) {
      console.log(`\n  — المرّة ${pass} خلصت، فاضل ${remaining.length} جدول —\n`);
    }
  }

  const totalRestored = [...restored.values()].reduce((a, b) => a + b, 0);

  console.log(`\n${"─".repeat(56)}`);
  console.log(`اتسترجع: ${restored.size} جدول · ${totalRestored} صف`);

  if (remaining.length > 0) {
    console.log(`\n⚠ فشل ${remaining.length} جدول — الاسترجاع **ناقص**:`);
    for (const item of remaining) {
      console.log(`   ${item.table}: ${item.lastError}`);
    }
    process.exit(1);
  }

  console.log("\n✓ الاسترجاع اكتمل بالكامل.");
}

main().catch((err) => {
  console.error("\n✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
