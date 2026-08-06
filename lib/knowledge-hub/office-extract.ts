/**
 * استخراج نصّ آمن من ملفات Office (xlsx / docx) — **بلا مكتبة `xlsx`
 * الثغرية**. الملفات دي أصلًا حاويات ZIP فيها XML، فبنفكّها بـ jszip
 * (تبعية موجودة بالفعل عبر mammoth، بلا ثغرات) ونقرأ الـ XML مباشرةً.
 *
 * تحليل الـ XML مفصول في دوال **نقيّة قابلة للاختبار** بلا شبكة ولا ملفات؛
 * فكّ الـ ZIP هو الغلاف الرفيع الوحيد اللي محتاج I/O.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#10;": "\n", "&#9;": "\t",
};

/** يفكّ ترميز كيانات XML الشائعة + الرقمية. */
export function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => ENTITIES[m] ?? m);
}

/** يجمع نصوص `<t>` داخل كتلة XML (يدعم runs متعدّدة). */
function collectText(fragment: string): string {
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = re.exec(fragment))) out += decodeXml(m[1]);
  return out;
}

// ── XLSX ──

/** يحلّل `sharedStrings.xml` → مصفوفة نصوص مفهرسة. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(collectText(m[1]));
  return out;
}

/** يحوّل XML ورقة عمل واحدة إلى نصّ (صفوف بأعمدة مفصولة بـ tab). */
export function sheetToText(sheetXml: string, shared: string[]): string {
  const rows: string[] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml))) {
    const cells: string[] = [];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1] ?? "";
      const inner = cm[2] ?? "";
      const tType = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "";
      let val = "";
      if (tType === "s") {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        val = Number.isFinite(idx) ? shared[idx] ?? "" : "";
      } else if (tType === "inlineStr" || tType === "str") {
        val = collectText(inner) || decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      } else {
        val = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }
      cells.push(val);
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

// ── DOCX ──

/** يجرّد وسوم Word مع الحفاظ على حدود الفقرات والجداول والـ tabs. */
export function stripDocxXml(xml: string): string {
  return decodeXml(
    xml
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ── غلاف فكّ الـ ZIP (I/O رفيع) ──

async function loadZip(buffer: Buffer) {
  const JSZip = (await import("jszip")).default;
  return JSZip.loadAsync(buffer);
}

/** يستخرج نصّ كل أوراق مصنّف xlsx بالترتيب. */
export async function extractXlsxText(buffer: Buffer): Promise<string> {
  const zip = await loadZip(buffer);
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const shared = sharedFile ? parseSharedStrings(await sharedFile.async("string")) : [];

  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(/sheet(\d+)\.xml$/i.exec(a)?.[1] ?? 0);
      const nb = Number(/sheet(\d+)\.xml$/i.exec(b)?.[1] ?? 0);
      return na - nb;
    });

  const parts: string[] = [];
  for (const name of sheetNames) {
    const file = zip.file(name);
    if (!file) continue;
    const text = sheetToText(await file.async("string"), shared);
    if (text.trim()) parts.push(text);
  }
  return parts.join("\n\n");
}

/** استخراج احتياطي من docx مباشرةً من document.xml (لما mammoth يرجّع فارغ). */
export async function extractDocxXmlFallback(buffer: Buffer): Promise<string> {
  const zip = await loadZip(buffer);
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  return stripDocxXml(await doc.async("string"));
}
