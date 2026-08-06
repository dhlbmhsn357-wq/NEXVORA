/**
 * تمثيل مجموعة البيانات وتحليلها — **وحدة نقية بلا I/O**.
 *
 * المرحلة ٣ تحتاج **الصفوف الفعلية** (لا البنية فقط). هذه الوحدة تحوّل
 * محتوى مصدر مرفوع (CSV/JSON) إلى صفوف قابلة للتحليل. **لا تُخزَّن الصفوف
 * الخام** — تُحلَّل في الذاكرة وتُحفَظ المشتقّات فقط (مقاييس + مشاكل).
 */

export interface Dataset {
  name: string;
  fields: string[];
  rows: Array<Record<string, string>>;
}

/** يقسم سطر CSV محترمًا الاقتباس المزدوج. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCsvDataset(content: string, name = "dataset"): Dataset {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { name, fields: [], rows: [] };
  const fields = splitCsvLine(lines[0]).map((h, i) => h || `col_${i + 1}`);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    fields.forEach((f, i) => (row[f] = cells[i] ?? ""));
    return row;
  });
  return { name, fields, rows };
}

export function parseJsonDataset(content: string, name = "dataset"): Dataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { name, fields: [], rows: [] };
  }
  let records: Record<string, unknown>[] = [];
  if (Array.isArray(parsed)) records = parsed.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  else if (parsed && typeof parsed === "object") {
    // شكل تصدير شائع: {tableName: [rows...]} — خذ أول مصفوفة كائنات.
    const arr = Object.values(parsed as Record<string, unknown>).find((v) => Array.isArray(v) && (v as unknown[]).some((x) => x && typeof x === "object"));
    if (arr) records = (arr as unknown[]).filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    else records = [parsed as Record<string, unknown>];
  }
  const fieldSet = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) fieldSet.add(k);
  const fields = [...fieldSet];
  const rows = records.map((r) => {
    const row: Record<string, string> = {};
    for (const f of fields) {
      const v = r[f];
      row[f] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    return row;
  });
  return { name, fields, rows };
}

/** يحلّل محتوى مصدر إلى مجموعة بيانات حسب النوع. */
export function parseDataset(sourceType: string, content: string, name = "dataset"): Dataset {
  const text = (content ?? "").trim();
  if (text.length === 0) return { name, fields: [], rows: [] };
  if (sourceType === "json" || /^\s*[[{]/.test(text)) return parseJsonDataset(text, name);
  return parseCsvDataset(text, name);
}

/**
 * يحلّل المحتوى إلى **خريطة مجموعات** (name → Dataset). شكل تصدير JSON
 * `{customers:[...], orders:[...]}` → مجموعة لكل مفتاح (يمكّن التحقّق
 * التجاري والسلامة المرجعية عبر الجداول). CSV/JSON-array → مجموعة واحدة.
 */
export function parseDatasets(sourceType: string, content: string, name = "dataset"): Record<string, Dataset> {
  const text = (content ?? "").trim();
  if (text.length === 0) return {};
  const isJson = sourceType === "json" || /^\s*[[{]/.test(text);
  if (isJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {};
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>).filter(
        ([, v]) => Array.isArray(v) && (v as unknown[]).some((x) => x && typeof x === "object")
      );
      if (entries.length > 0) {
        const out: Record<string, Dataset> = {};
        for (const [key, arr] of entries) out[key] = parseJsonDataset(JSON.stringify(arr), key);
        return out;
      }
    }
    return { [name]: parseJsonDataset(text, name) };
  }
  return { [name]: parseCsvDataset(text, name) };
}
