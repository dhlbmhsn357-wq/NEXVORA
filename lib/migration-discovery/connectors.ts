import type { ConnectionMode } from "./source-types";
import { isExecutableNow, sourceTypeLabel } from "./source-types";
import { parseCsv, parseJson, parseDdl, emptySchema, computeSchemaStats, type NormalizedSchema } from "./schema-model";

/**
 * طبقة الموصّلات — **وحدة نقية بلا I/O** (تأخذ المحتوى نصًّا).
 *
 * توحّد كل المصادر في `NormalizedSchema`:
 * - `file_upload`   → parseCsv / parseJson حسب النوع.
 * - `schema_upload` → parseDdl (SQL) / parseJson (JSON schema export).
 * - `live_connection` → **غير مفعَّل** بأمان (لا اتصال صادر من الخادم بلا
 *   طبقة عزل؛ نفس نمط infra-signals). ينشط لاحقًا عبر موصّل معزول.
 *
 * الفصل بين تنفيذ الاتصال (I/O، في الخدمة) والتحليل النصّي (هنا، نقي)
 * يجعل كل منطق الفهم قابلًا للاختبار بلا شبكة ولا ملفات.
 */

export interface ConnectionTestResult {
  ok: boolean;
  configured: boolean;
  durationMs: number;
  version: string | null;
  dbType: string | null;
  tableCount: number;
  approxSize: string | null;
  issues: string[];
}

export interface ParseResult {
  ok: boolean;
  schema: NormalizedSchema;
  issues: string[];
}

/**
 * يحلّل محتوى مصدر مرفوع/ملصوق إلى بنية مُطبَّعة. يختار المحلّل من نوع
 * المصدر ووضع الاتصال. متسامح: يرجّع issues بدل الرمي.
 */
export function parseSourceContent(
  sourceType: string,
  mode: ConnectionMode,
  content: string,
  objectName = "imported"
): ParseResult {
  const issues: string[] = [];
  const text = (content ?? "").trim();
  if (text.length === 0) {
    return { ok: false, schema: emptySchema(), issues: ["المحتوى فارغ."] };
  }

  // schema_upload: DDL نصّي أو JSON schema export.
  if (mode === "schema_upload") {
    if (/^\s*[[{]/.test(text)) {
      const schema = parseJson(text, objectName);
      if (schema.objects.length === 0) issues.push("لم نتعرّف على كائنات في JSON.");
      return { ok: schema.objects.length > 0, schema, issues };
    }
    const schema = parseDdl(text);
    if (schema.objects.length === 0) issues.push("لم نجد أي CREATE TABLE في نصّ الـSchema.");
    return { ok: schema.objects.length > 0, schema, issues };
  }

  // file_upload: حسب النوع.
  if (mode === "file_upload") {
    switch (sourceType) {
      case "json": {
        const schema = parseJson(text, objectName);
        return { ok: schema.objects.length > 0, schema, issues: schema.objects.length > 0 ? [] : ["JSON غير صالح أو بلا كائنات."] };
      }
      case "csv":
      case "excel":
      case "paper_template":
      case "generic":
      default: {
        // CSV نصّي (Excel يُصدَّر CSV في هذا الإصدار).
        const schema = parseCsv(text, objectName);
        if (schema.objects.length === 0 || schema.objects[0].columns.length === 0) {
          issues.push("لم نتعرّف على ترويسة/أعمدة — تأكّد أن الصفّ الأول ترويسة.");
          return { ok: false, schema, issues };
        }
        return { ok: true, schema, issues };
      }
    }
  }

  return { ok: false, schema: emptySchema(), issues: ["وضع الاتصال غير مدعوم للتحليل النصّي."] };
}

/**
 * اختبار الاتصال/الصلاحية قبل الحفظ. للملفات/الـSchema: يتحقّق من قابلية
 * التحليل ويعرض إحصاءات. للاتصال الحيّ: يرجّع حالة **غير مُهيَّأ** واضحة
 * بلا محاولة اتصال (آمن، لا يفشل، لا يسرّب).
 */
export function testConnectionFromContent(
  sourceType: string,
  mode: ConnectionMode,
  content: string
): ConnectionTestResult {
  const base: ConnectionTestResult = {
    ok: false,
    configured: false,
    durationMs: 0,
    version: null,
    dbType: sourceTypeLabel(sourceType),
    tableCount: 0,
    approxSize: null,
    issues: [],
  };

  if (mode === "live_connection") {
    return {
      ...base,
      configured: isExecutableNow(sourceType, mode),
      issues: [
        "الاتصال الحيّ المباشر غير مفعَّل في هذا الإصدار (يُنفَّذ عبر طبقة اتصال معزولة لاحقًا). " +
          "استخدم رفع Schema Dump/DDL أو ملف — الأأمن لقواعد الإنتاج.",
      ],
    };
  }

  const parsed = parseSourceContent(sourceType, mode, content);
  const stats = computeSchemaStats(parsed.schema);
  return {
    ...base,
    ok: parsed.ok,
    configured: true,
    tableCount: stats.tables + stats.collections,
    approxSize: `${stats.columns} عمود · ${stats.rowCountTotal || "—"} صفّ`,
    issues: parsed.issues,
  };
}
