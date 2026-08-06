import type { LoadRow } from "./load-types";

/**
 * مُسلسِلات مخرجات الحمل — **نقيّة بلا I/O**. تحوّل الصفوف المُحوَّلة إلى
 * صيغ استيراد آمنة: CSV · JSON · SQL INSERT.
 *
 * الأمان هنا حرفيّ: الهروب الصحيح للفواصل والاقتباسات يمنع كسر الملف أو
 * حقن SQL. كل شيء قابل للاختبار بلا قاعدة بيانات.
 */

/** يجمع كل المفاتيح عبر كل الصفوف (ترتيب أوّل ظهور) — ترويسة مستقرّة. */
export function collectColumns(rows: LoadRow[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

// ── CSV ──

/** يهرب قيمة CSV: يقتبسها لو فيها فاصلة/اقتباس/سطر جديد، ويُضاعف الاقتباس. */
export function csvEscape(value: string): string {
  const v = value ?? "";
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** يُسلسل الصفوف إلى CSV بترويسة. صفّ فارغ → ترويسة فقط. */
export function toCsv(rows: LoadRow[], columns?: string[]): string {
  const cols = columns ?? collectColumns(rows);
  const header = cols.map(csvEscape).join(",");
  const lines = rows.map((row) => cols.map((c) => csvEscape(row[c] ?? "")).join(","));
  return [header, ...lines].join("\r\n");
}

// ── JSON ──

export function toJson(rows: LoadRow[]): string {
  return JSON.stringify(rows, null, 2);
}

// ── SQL ──

/** يهرب مُعرِّفًا (جدول/عمود) بالاقتباس المزدوج مع مضاعفة أي اقتباس داخلي. */
export function sqlIdentifier(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** يهرب قيمة SQL نصّية: يُضاعف الاقتباس المفرد. القيمة الفارغة الصريحة → NULL. */
export function sqlValue(value: string | undefined | null): string {
  if (value === undefined || value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

export interface SqlOptions {
  /** حجم الدفعة في عبارة INSERT الواحدة (VALUES متعدّدة). */
  batchSize?: number;
  /** ON CONFLICT DO NOTHING لتفادي فشل التكرار عند إعادة الحمل. */
  onConflictDoNothing?: boolean;
}

/**
 * يُنتج عبارات INSERT مُجمّعة. يُقتبس كل مُعرِّف، ويُهرب كل قيمة. يُقسّم
 * على دفعات (batchSize) لتفادي عبارات ضخمة. آمن ضدّ حقن SQL بالبناء.
 */
export function toSqlInserts(table: string, rows: LoadRow[], opts: SqlOptions = {}): string {
  if (rows.length === 0) return `-- لا صفوف للكيان ${table}\n`;
  const batchSize = Math.max(1, Math.min(1000, opts.batchSize ?? 500));
  const cols = collectColumns(rows);
  const colList = cols.map(sqlIdentifier).join(", ");
  const suffix = opts.onConflictDoNothing ? " on conflict do nothing" : "";
  const statements: string[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueRows = batch.map(
      (row) => `  (${cols.map((c) => sqlValue(row[c])).join(", ")})`
    );
    statements.push(
      `insert into ${sqlIdentifier(table)} (${colList}) values\n${valueRows.join(",\n")}${suffix};`
    );
  }
  return statements.join("\n\n") + "\n";
}

/** يختار المُسلسِل حسب الصيغة. */
export function serialize(format: "json" | "csv" | "sql", table: string, rows: LoadRow[], opts?: SqlOptions): string {
  switch (format) {
    case "csv":
      return toCsv(rows);
    case "sql":
      return toSqlInserts(table, rows, opts);
    case "json":
    default:
      return toJson(rows);
  }
}
