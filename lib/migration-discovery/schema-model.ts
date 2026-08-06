/**
 * نموذج البنية المُطبَّع + محلّلات المصادر — **وحدة نقية بلا I/O**.
 *
 * تُوحِّد أي مصدر (قاعدة SQL عبر DDL، ملف CSV/JSON) في نفس الشكل
 * `NormalizedSchema` الذي تستهلكه كل محرّكات التحليل التالية (الكشف
 * الدلالي، العلاقات، الجودة، المخاطر). «افهم أي مصدر» = طبّعه هنا أولًا.
 */

export interface NormalizedColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isAutoIncrement: boolean;
  defaultValue: string | null;
  references: { table: string; column: string } | null;
}

export interface NormalizedObject {
  name: string;
  kind: "table" | "view" | "collection";
  schema: string | null;
  columns: NormalizedColumn[];
  rowCount: number | null;
}

export interface NormalizedSchema {
  objects: NormalizedObject[];
  dialect: string | null;
  encoding: string | null;
  collation: string | null;
}

export function emptySchema(): NormalizedSchema {
  return { objects: [], dialect: null, encoding: null, collation: null };
}

function col(name: string, dataType = "unknown", extra: Partial<NormalizedColumn> = {}): NormalizedColumn {
  return {
    name: name.trim(),
    dataType,
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    isAutoIncrement: false,
    defaultValue: null,
    references: null,
    ...extra,
  };
}

/** يستنتج نوع بيانات مبسّط من قيمة نصّية (لملفات بلا أنواع صريحة). */
export function inferType(value: string): string {
  const v = (value ?? "").trim();
  if (v === "") return "unknown";
  if (/^-?\d+$/.test(v)) return "integer";
  if (/^-?\d+\.\d+$/.test(v)) return "decimal";
  if (/^(true|false)$/i.test(v)) return "boolean";
  if (/^\d{4}-\d{2}-\d{2}([ t]\d{2}:\d{2})?/i.test(v)) return "timestamp";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "email";
  return "text";
}

// ============================================================
// CSV
// ============================================================

/** يقسم سطر CSV واحدًا محترمًا علامات الاقتباس المزدوجة. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * يحلّل محتوى CSV إلى كائن واحد: أعمدة من الترويسة، أنواع مستنتَجة من
 * عيّنة الصفوف، عدد الصفوف الفعلي.
 */
export function parseCsv(content: string, objectName: string): NormalizedSchema {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return emptySchema();

  const headers = splitCsvLine(lines[0]);
  const dataRows = lines.slice(1).map(splitCsvLine);
  const sample = dataRows.slice(0, 200);

  const columns = headers.map((h, idx) => {
    const values = sample.map((r) => r[idx] ?? "").filter((v) => v !== "");
    const types = new Set(values.map(inferType));
    const nullable = sample.some((r) => (r[idx] ?? "") === "");
    const dataType = types.size === 1 ? [...types][0] : types.size === 0 ? "unknown" : "mixed";
    const looksKey = /(^id$|_id$|^id_)/i.test(h);
    return col(h || `col_${idx + 1}`, dataType, { nullable, isPrimaryKey: h.toLowerCase() === "id", isForeignKey: looksKey && h.toLowerCase() !== "id" });
  });

  return {
    objects: [{ name: objectName, kind: "table", schema: null, columns, rowCount: dataRows.length }],
    dialect: "csv",
    encoding: "utf-8",
    collation: null,
  };
}

// ============================================================
// JSON
// ============================================================

/**
 * يحلّل JSON: كائن أو مصفوفة كائنات → كائن واحد بأعمدة من مفاتيحه؛ كائن
 * جذر بمفاتيح كلٌّ منها مصفوفة كائنات → كائن لكل مفتاح (شكل تصدير شائع).
 */
export function parseJson(content: string, fallbackName: string): NormalizedSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return emptySchema();
  }

  const objects: NormalizedObject[] = [];

  const objectFromRows = (rows: Record<string, unknown>[], name: string): NormalizedObject => {
    const keys = new Map<string, Set<string>>();
    const presenceCount = new Map<string, number>();
    const sample = rows.slice(0, 200);
    for (const row of sample) {
      const rowKeys = new Set(Object.keys(row ?? {}));
      for (const k of rowKeys) {
        const v = (row as Record<string, unknown>)[k];
        const t = v === null || v === undefined ? "unknown" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : inferType(String(v));
        if (!keys.has(k)) keys.set(k, new Set());
        keys.get(k)!.add(t);
        presenceCount.set(k, (presenceCount.get(k) ?? 0) + 1);
      }
    }
    const columns = [...keys.entries()].map(([k, types]) => {
      const dataType = types.size === 1 ? [...types][0] : "mixed";
      // مفتاح غائب في بعض الصفوف أو حامل قيمة null = قابل للإفراغ.
      const nullable = (presenceCount.get(k) ?? 0) < sample.length || types.has("unknown");
      return col(k, dataType, { nullable, isPrimaryKey: k.toLowerCase() === "id" || k.toLowerCase() === "_id", isForeignKey: /_id$/i.test(k) });
    });
    return { name, kind: "collection", schema: null, columns, rowCount: rows.length };
  };

  if (Array.isArray(parsed)) {
    objects.push(objectFromRows(parsed.filter((r) => r && typeof r === "object") as Record<string, unknown>[], fallbackName));
  } else if (parsed && typeof parsed === "object") {
    const entries = Object.entries(parsed as Record<string, unknown>);
    const arrayEntries = entries.filter(([, v]) => Array.isArray(v) && (v as unknown[]).some((x) => x && typeof x === "object"));
    if (arrayEntries.length > 0) {
      for (const [name, v] of arrayEntries) {
        objects.push(objectFromRows((v as unknown[]).filter((r) => r && typeof r === "object") as Record<string, unknown>[], name));
      }
    } else {
      objects.push(objectFromRows([parsed as Record<string, unknown>], fallbackName));
    }
  }

  return { objects, dialect: "json", encoding: "utf-8", collation: null };
}

// ============================================================
// DDL / SQL Schema Dump — الأأمن لأي قاعدة SQL (رفع البنية فقط)
// ============================================================

const TYPE_KEYWORDS = /^(int|integer|bigint|smallint|tinyint|serial|bigserial|decimal|numeric|float|double|real|money|char|varchar|nvarchar|text|ntext|clob|date|datetime|datetime2|timestamp|timestamptz|time|bool|boolean|uuid|json|jsonb|xml|blob|bytea|binary|varbinary|enum)/i;

/**
 * يحلّل نصّ DDL (CREATE TABLE ...) من أي لهجة SQL شائعة (Postgres/MySQL/
 * SQL Server) إلى بنية مُطبَّعة: جداول، أعمدة، أنواع، nullable، مفاتيح
 * أساسية، مفاتيح خارجية (references)، auto increment، القيم الافتراضية.
 *
 * محلّل عملي متسامح (لا محرّك SQL كامل) — يغطّي الأشكال الشائعة، ويتجاوز
 * ما لا يفهمه بلا فشل.
 */
export function parseDdl(sql: string): NormalizedSchema {
  const objects: NormalizedObject[] = [];
  const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"[\]\w.]+)\s*\(([\s\S]*?)\)\s*(?:engine|;|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(stripped)) !== null) {
    const rawName = match[1];
    const body = match[2];
    const { schema, name } = splitQualifiedName(rawName);
    const columns: NormalizedColumn[] = [];
    const pkFromConstraints = new Set<string>();

    for (const rawLine of splitTopLevel(body)) {
      const line = rawLine.trim();
      if (line === "") continue;
      const lower = line.toLowerCase();

      // قيود على مستوى الجدول.
      if (/^(primary\s+key)\s*\(/i.test(line)) {
        for (const c of extractParenColumns(line)) pkFromConstraints.add(c);
        continue;
      }
      if (/^(constraint\b.*)?foreign\s+key\s*\(/i.test(line) || /^foreign\s+key\s*\(/i.test(line)) {
        const local = extractParenColumns(line)[0];
        const ref = /references\s+([`"[\]\w.]+)\s*\(([^)]+)\)/i.exec(line);
        if (local && ref) {
          const existing = columns.find((c) => c.name.toLowerCase() === local.toLowerCase());
          const target = splitQualifiedName(ref[1]);
          const refCol = ref[2].replace(/[`"[\]\s]/g, "");
          if (existing) {
            existing.isForeignKey = true;
            existing.references = { table: target.name, column: refCol };
          }
        }
        continue;
      }
      if (/^(constraint|unique|check|key|index)\b/i.test(lower)) continue;

      // تعريف عمود.
      const nameMatch = /^([`"[\]\w]+)\s+(.+)$/.exec(line);
      if (!nameMatch) continue;
      const colName = nameMatch[1].replace(/[`"[\]]/g, "");
      const rest = nameMatch[2];
      const typeMatch = /^([a-z_]+)(\s*\([^)]*\))?/i.exec(rest);
      if (!typeMatch || !TYPE_KEYWORDS.test(typeMatch[1])) {
        // ليس عمودًا نفهمه — تجاوز.
        continue;
      }
      const dataType = typeMatch[1].toLowerCase();
      const c = col(colName, dataType, {
        nullable: !/not\s+null/i.test(rest),
        isPrimaryKey: /primary\s+key/i.test(rest),
        isAutoIncrement: /(auto_increment|identity|serial|bigserial)/i.test(rest) || /serial/i.test(dataType),
        defaultValue: extractDefault(rest),
      });
      const inlineRef = /references\s+([`"[\]\w.]+)\s*\(([^)]+)\)/i.exec(rest);
      if (inlineRef) {
        c.isForeignKey = true;
        const target = splitQualifiedName(inlineRef[1]);
        c.references = { table: target.name, column: inlineRef[2].replace(/[`"[\]\s]/g, "") };
      }
      columns.push(c);
    }

    for (const c of columns) if (pkFromConstraints.has(c.name.toLowerCase()) || pkFromConstraints.has(c.name)) c.isPrimaryKey = true;
    // heuristic: عمود اسمه id بلا PK صريح ما زال مرجّحًا مفتاحًا.
    if (!columns.some((c) => c.isPrimaryKey)) {
      const idCol = columns.find((c) => c.name.toLowerCase() === "id");
      if (idCol) idCol.isPrimaryKey = true;
    }
    for (const c of columns) if (/_id$/i.test(c.name) && !c.isPrimaryKey) c.isForeignKey = c.isForeignKey || false;

    objects.push({ name, kind: "table", schema, columns, rowCount: null });
  }

  return { objects, dialect: "sql", encoding: null, collation: null };
}

function splitQualifiedName(raw: string): { schema: string | null; name: string } {
  const clean = raw.replace(/[`"[\]]/g, "");
  const parts = clean.split(".");
  if (parts.length >= 2) return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
  return { schema: null, name: clean };
}

/** يقسم جسم CREATE TABLE على الفواصل العليا (يحترم الأقواس المتداخلة). */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function extractParenColumns(line: string): string[] {
  const m = /\(([^)]+)\)/.exec(line);
  if (!m) return [];
  return m[1].split(",").map((c) => c.replace(/[`"[\]\s]/g, "").toLowerCase()).filter(Boolean);
}

function extractDefault(rest: string): string | null {
  const m = /default\s+('[^']*'|"[^"]*"|[\w.]+)/i.exec(rest);
  return m ? m[1] : null;
}

/** إحصاءات مجمّعة من بنية مُطبَّعة — تُكتب في migration_snapshots.stats. */
export function computeSchemaStats(schema: NormalizedSchema): {
  tables: number;
  views: number;
  collections: number;
  columns: number;
  rowCountTotal: number;
  encoding: string | null;
  collation: string | null;
} {
  let columns = 0;
  let rowCountTotal = 0;
  let tables = 0;
  let views = 0;
  let collections = 0;
  for (const o of schema.objects) {
    columns += o.columns.length;
    rowCountTotal += o.rowCount ?? 0;
    if (o.kind === "table") tables++;
    else if (o.kind === "view") views++;
    else collections++;
  }
  return { tables, views, collections, columns, rowCountTotal, encoding: schema.encoding, collation: schema.collation };
}
